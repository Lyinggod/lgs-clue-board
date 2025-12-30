// scripts/ClueBoardInteractionManager.js
import { MODULE_ID, DEFAULT_ACTOR_ITEM_WIDTH, DEFAULT_ACTOR_ITEM_HEIGHT, DEFAULT_NOTE_WIDTH, DEFAULT_NOTE_HEIGHT, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT, PLACEHOLDER_IMAGE_PATH } from './constants.js';
import { ClueBoardData } from './ClueBoardData.js';
import { ClueBoardConfigDialog } from './ClueBoardConfigDialog.js';
import { AddNoteDialog } from './AddNoteDialog.js';
import { ClueItemConfigDialog } from './ClueItemConfigDialog.js';
import { AddClueDialog } from './AddClueDialog.js';
import { ClueNodeConfigDialog } from './ClueNodeConfigDialog.js';
import { RevealImageDialog } from './RevealImageDialog.js'; 
import { socketController } from './SocketController.js'; 

export class ClueBoardInteractionManager {
    constructor(dialog) {
        this.dialog = dialog;
    }

    /**
     * Activates all event listeners for the clue board canvas and its items.
     * @param {jQuery} html The jQuery object representing the application's HTML.
     */
    activateListeners(html) {
        const boardCanvas = html.find('.clue-board-canvas');
        if (!boardCanvas.length) return;
		
		boardCanvas.on('dragover', (event) => event.preventDefault());

        if (game.user.isGM) {
            html.find('.clue-board-config-button').on('click', this._onConfigButtonClick.bind(this));
            const gmNotePreviewDiv = html.find('.gm-note-preview');
            if (gmNotePreviewDiv.length) {
                boardCanvas.on('mouseenter', '.clue-item', (event) => {
                    const itemElement = $(event.currentTarget);
                    const itemId = itemElement.data('itemId');
                    const itemData = this.dialog.currentBoardData.items[itemId];
                    if (itemData) {
                        const gmContent = itemData.type === 'note' ? itemData.gmText : itemData.gmNotes;
                        if (gmContent && gmContent.trim() !== "") {
                            gmNotePreviewDiv.find('.gm-note-preview-content').html(gmContent);
                            gmNotePreviewDiv.show();
                        }
                    }
                }).on('mouseleave', '.clue-item', () => {
                    gmNotePreviewDiv.hide().find('.gm-note-preview-content').empty();
                });
            }
        }

        boardCanvas.on('mousedown', '.clue-item', this._onItemMouseDown.bind(this));
        boardCanvas.on('contextmenu', '.clue-item', this._onItemContextMenu.bind(this));
        boardCanvas.on('mousedown', this._onBoardCanvasMouseDown.bind(this));
        boardCanvas.on('click', this._onBoardCanvasClick.bind(this));
        boardCanvas.on('mousemove', this._onBoardCanvasMouseMove.bind(this));
        boardCanvas.on('contextmenu', this._onBoardContextMenu.bind(this));

        $(document).off(`click.clueboard-hidecontext-${this.dialog.boardId}`)
            .on(`click.clueboard-hidecontext-${this.dialog.boardId}`, (event) => {
                const target = $(event.target);
                if (!target.closest('.clue-item, .item-context-menu-icons, .context-menu').length) {
                    this.dialog.element.find('.item-context-menu-icons').hide();
                }
            });
    }

    _onConfigButtonClick(event) {
        event.preventDefault();
        this.dialog.clearAllSelections();
        new ClueBoardConfigDialog(this.dialog.boardId, this.dialog).render(true);
    }

    _onBoardCanvasMouseDown(event) {
        if (event.button !== 0 || this.dialog.drawingLine) return;
        if (!$(event.target).closest('.clue-item').length) {
            this._startMarqueeSelection(event);
        }
    }

    _onBoardCanvasClick(event) {
		if (this.dialog.drawingLine && this.dialog.lineFromItemId) {
			const clickedItemElement = $(event.target).closest('.clue-item');
			if (clickedItemElement.length) {
				const toItemId = clickedItemElement.data('itemId');
				const toItemData = this.dialog.currentBoardData.items[toItemId];
				if (toItemId && toItemData) {
					if (!game.user.isGM && toItemData.isHiddenFromPlayer) {
						ui.notifications.warn(game.i18n.localize("LGS_CB2.Notifications.CannotConnectToHiddenItem"));
					} else if (toItemId !== this.dialog.lineFromItemId) {
						this._createConnection(this.dialog.lineFromItemId, toItemId);
					}
				}
			}
			this._endLineDrawing();
			event.stopPropagation();
			return; 
		}

		if (this.dialog.justFinishedMarquee) {
			this.dialog.justFinishedMarquee = false;
			return;
		}

		if (!this.dialog.isMarqueeSelecting && !this.dialog.draggingItem && !this.dialog.isMultiDragging &&
			!$(event.target).closest('.clue-item, .context-menu, .item-context-menu-icons').length) {
			this.dialog.clearAllSelections();
			this.dialog.element.find('.item-context-menu-icons').hide();
		}
	}

    _onBoardCanvasMouseMove(event) {
        if (this.dialog.isMarqueeSelecting) this._updateMarqueeSelection(event);
        else if (this.dialog.drawingLine) this._updateTempLine(event);
        else if (this.dialog.draggingItem || this.dialog.isMultiDragging) this._onDragMouseMove(event);
    }

    _onBoardCanvasMouseUp(event) {
        if (this.dialog.isMarqueeSelecting) this._endMarqueeSelection();
        else if (this.dialog.draggingItem || this.dialog.isMultiDragging) this._onDragMouseUp(event);
        
        $(document).off(`mousemove.clueboardglobal-${this.dialog.boardId}`);
        $(document).off(`mouseup.clueboardglobal-${this.dialog.boardId}`);
    }

    _onItemMouseDown(event) {
        if (this.dialog.drawingLine || event.button !== 0) return;

        const itemElement = $(event.currentTarget);
        const itemId = itemElement.data('itemId');
        const itemData = this.dialog.currentBoardData.items[itemId];
        if (!itemData || (!game.user.isGM && itemData.isHiddenFromPlayer)) return;

        const canMove = game.user.isGM || (!this.dialog.currentBoardData.config.preventPlayerMove && !itemData.isLocked);
        
        if (event.ctrlKey || event.metaKey) {
            this.dialog.toggleItemSelected(itemId);
            event.stopPropagation();
        } else if (!this.dialog.selectedItemIds.has(itemId)) {
            this.dialog.clearAllSelections();
            this.dialog.toggleItemSelected(itemId, true);
        }
        
        if (canMove) this._startDrag(event, itemElement);
    }

    _startDrag(event, primaryItemElement) {
        this.dialog.isMultiDragging = true;
        this.dialog.draggingItem = primaryItemElement;
        
        this.dialog.dragOffset = {
            x: event.clientX - primaryItemElement.offset().left,
            y: event.clientY - primaryItemElement.offset().top
        };
        
        this.dialog.multiDragInitialPositions.clear();
        for (const selId of this.dialog.selectedItemIds) {
            const selItemData = this.dialog.currentBoardData.items[selId];
            const selItemElement = this.dialog.element.find(`.clue-item[data-item-id="${selId}"]`);
            if (selItemData && selItemElement.length) {
                this.dialog.multiDragInitialPositions.set(selId, {
                    x: selItemData.x, 
                    y: selItemData.y,
                    initialLeft: parseInt(selItemElement.css('left'), 10),
                    initialTop: parseInt(selItemElement.css('top'), 10)
                });
                selItemElement.addClass('dragging');
            }
        }

        $(document).on(`mousemove.clueboardglobal-${this.dialog.boardId}`, this._onBoardCanvasMouseMove.bind(this))
                   .on(`mouseup.clueboardglobal-${this.dialog.boardId}`, this._onBoardCanvasMouseUp.bind(this));
    }

    _onDragMouseMove(event) {
        if (!this.dialog.draggingItem && !this.dialog.isMultiDragging) return;
        event.preventDefault();
        
        const boardCanvas = this.dialog.element.find('.clue-board-canvas');
        const boardRect = boardCanvas[0].getBoundingClientRect();
        const primaryItemId = this.dialog.draggingItem.data('itemId');
        const primaryItemInitialPos = this.dialog.multiDragInitialPositions.get(primaryItemId);
        if (!primaryItemInitialPos) return;

        const globalScale = this.dialog.currentBoardData.config.globalItemScale || 1.0;
        let primaryNewVisualX = event.clientX - boardRect.left - this.dialog.dragOffset.x;
        let primaryNewVisualY = event.clientY - boardRect.top - this.dialog.dragOffset.y;
        
        const primaryItemData = this.dialog.currentBoardData.items[primaryItemId];
        const primaryItemDims = this.dialog.renderer.getItemDimensions(primaryItemData);
        let primaryNewUnscaledX, primaryNewUnscaledY;

        if (primaryItemData.type === 'node') {
             primaryNewUnscaledX = primaryNewVisualX + (primaryItemDims.width/2) * (1-globalScale) - primaryItemDims.width/2;
             primaryNewUnscaledY = primaryNewVisualY + (primaryItemDims.height/2) * (1-globalScale) - primaryItemDims.height/2;
        } else {
             primaryNewUnscaledX = primaryNewVisualX - (primaryItemDims.width / 2) * (1 - globalScale);
             primaryNewUnscaledY = primaryNewVisualY - (primaryItemDims.height / 2) * (1 - globalScale);
        }
        
        const dx = primaryNewUnscaledX - primaryItemInitialPos.initialLeft;
        const dy = primaryNewUnscaledY - primaryItemInitialPos.initialTop;
        const draggedItemsUpdate = [];

        for (const itemId of this.dialog.selectedItemIds) {
            const itemEl = this.dialog.element.find(`.clue-item[data-item-id="${itemId}"]`);
            const itemData = this.dialog.currentBoardData.items[itemId];
            const initialPos = this.dialog.multiDragInitialPositions.get(itemId);
            if (!itemEl.length || !itemData || !initialPos) continue;

            const itemDimensions = this.dialog.renderer.getItemDimensions(itemData);
            let newX = initialPos.initialLeft + dx;
            let newY = initialPos.initialTop + dy;

            // Bounds checking
            const canvasWidth = this.dialog.currentBoardData.config.width;
            const canvasHeight = this.dialog.currentBoardData.config.height;
            const scaledWidth = itemDimensions.width * globalScale;
            const scaledHeight = itemDimensions.height * globalScale;
            const visualTopLeftX = newX - (scaledWidth - itemDimensions.width) / 2;
            const visualTopLeftY = newY - (scaledHeight - itemDimensions.height) / 2;
            
            if (visualTopLeftX < 0) newX = (scaledWidth - itemDimensions.width) / 2;
            if (visualTopLeftX + scaledWidth > canvasWidth) newX = canvasWidth - scaledWidth + (scaledWidth - itemDimensions.width) / 2;
            if (visualTopLeftY < 0) newY = (scaledHeight - itemDimensions.height) / 2;
            if (visualTopLeftY + scaledHeight > canvasHeight) newY = canvasHeight - scaledHeight + (scaledHeight - itemDimensions.height) / 2;

            itemEl.css({ left: newX + 'px', top: newY + 'px' });
            draggedItemsUpdate.push({ itemId: itemId, left: newX, top: newY });
            this.dialog.renderer.updateConnectionsForItem(itemId);
        }
        
        this.dialog.renderer.renderCustomElements(); // Rerenders connections and circles

        const now = Date.now();
        if (draggedItemsUpdate.length > 0 && (now - this.dialog.lastDragUpdateTime > this.dialog.dragUpdateThrottleMs)) {
            socketController.broadcastItemDragUpdate(this.dialog.boardId, draggedItemsUpdate);
            this.dialog.lastDragUpdateTime = now;
        }
    }

    async _onDragMouseUp(event) {
        if (!this.dialog.isMultiDragging && !this.dialog.draggingItem) return;

        const finalPositionsForSave = new Map();
        for (const itemId of this.dialog.selectedItemIds) {
            const itemElement = this.dialog.element.find(`.clue-item[data-item-id="${itemId}"]`);
            const itemData = this.dialog.currentBoardData.items[itemId];

            if (itemElement.length && itemData) {
                itemElement.removeClass('dragging');
                let finalCssX = parseInt(itemElement.css('left'), 10);
                let finalCssY = parseInt(itemElement.css('top'), 10);
                
                let posToSave = { x: finalCssX, y: finalCssY };
                if (itemData.type === 'node') {
                    const itemDimensions = this.dialog.renderer.getItemDimensions(itemData);
                    posToSave.x = finalCssX + itemDimensions.width / 2; 
                    posToSave.y = finalCssY + itemDimensions.height / 2;
                }
                finalPositionsForSave.set(itemId, posToSave);
            }
        }
        
        this.dialog.draggingItem = null;
        this.dialog.isMultiDragging = false;
        this.dialog.multiDragInitialPositions.clear();
        this.dialog.lastDragUpdateTime = 0;
        
        if (finalPositionsForSave.size > 0) {
            for (const [itemId, pos] of finalPositionsForSave) {
                if (this.dialog.currentBoardData.items[itemId]) {
                    this.dialog.currentBoardData.items[itemId].x = pos.x;
                    this.dialog.currentBoardData.items[itemId].y = pos.y;
                }
            }

            if (game.user.isGM) {
                for (const [itemId, pos] of finalPositionsForSave) {
                    await ClueBoardData.updateItem(this.dialog.boardId, itemId, { x: pos.x, y: pos.y });
                }
            } else {
                const updates = Array.from(finalPositionsForSave, ([itemId, pos]) => ({ itemId, pos }));
                socketController.requestItemPositionUpdates(this.dialog.boardId, updates);
            }
        }
    }

    _startMarqueeSelection(event) {
        if (!event.ctrlKey && !event.metaKey) this.dialog.clearAllSelections();
        this.dialog.isMarqueeSelecting = true;
        const boardCanvas = this.dialog.element.find('.clue-board-canvas'); 
        const rect = boardCanvas[0].getBoundingClientRect();
        this.dialog.marqueeStartPos = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        
        if (!this.dialog.marqueeRectDiv || !boardCanvas[0].contains(this.dialog.marqueeRectDiv[0])) {
            this.dialog.marqueeRectDiv?.remove();
            this.dialog.marqueeRectDiv = $('<div class="marquee-select-rect"></div>').appendTo(boardCanvas);
        }

        this.dialog.marqueeRectDiv.css({
            left: this.dialog.marqueeStartPos.x + 'px', top: this.dialog.marqueeStartPos.y + 'px',
            width: '0px', height: '0px'
        }).show();

        $(document).on(`mousemove.clueboardglobal-${this.dialog.boardId}`, this._onBoardCanvasMouseMove.bind(this))
                   .on(`mouseup.clueboardglobal-${this.dialog.boardId}`, this._onBoardCanvasMouseUp.bind(this));
        event.stopPropagation();
    }

	_updateMarqueeSelection(event) {
		if (!this.dialog.isMarqueeSelecting) return;
		const boardCanvas = this.dialog.element.find('.clue-board-canvas');
		const rect = boardCanvas[0].getBoundingClientRect();
		const currentMouseX = event.clientX - rect.left;
		const currentMouseY = event.clientY - rect.top;

		const marqueeX = Math.min(this.dialog.marqueeStartPos.x, currentMouseX);
		const marqueeY = Math.min(this.dialog.marqueeStartPos.y, currentMouseY);
		const marqueeWidth = Math.abs(currentMouseX - this.dialog.marqueeStartPos.x);
		const marqueeHeight = Math.abs(currentMouseY - this.dialog.marqueeStartPos.y);

		this.dialog.marqueeRectDiv.css({ left: marqueeX + 'px', top: marqueeY + 'px', width: marqueeWidth + 'px', height: marqueeHeight + 'px' });
		const marqueeRect = { x: marqueeX, y: marqueeY, width: marqueeWidth, height: marqueeHeight };
		const itemsInMarquee = new Set();
		
		boardCanvas.find('.clue-item').each((idx, el) => {
			const itemElement = $(el);
			const itemId = itemElement.data('itemId');
			const itemData = this.dialog.currentBoardData.items[itemId];
			if (!game.user.isGM && itemData?.isHiddenFromPlayer) return;
			
			if (this._isItemIntersectingMarquee(itemElement, marqueeRect)) {
				itemsInMarquee.add(itemId);
				if (!this.dialog.selectedItemIds.has(itemId)) this.dialog.toggleItemSelected(itemId, true); 
			}
		});

		if (!event.ctrlKey && !event.metaKey) {
			const itemsToDeselect = [...this.dialog.selectedItemIds].filter(id => !itemsInMarquee.has(id));
			itemsToDeselect.forEach(itemId => this.dialog.toggleItemSelected(itemId, false));
		}
	}

	_endMarqueeSelection() {
		if (!this.dialog.isMarqueeSelecting) return;
		this.dialog.isMarqueeSelecting = false;
		this.dialog.justFinishedMarquee = true; 
		this.dialog.marqueeRectDiv?.hide(); 
		$(document).off(`mousemove.clueboardglobal-${this.dialog.boardId} mouseup.clueboardglobal-${this.dialog.boardId}`);
	}

	_isItemIntersectingMarquee(itemElement, marqueeRect) {
		const itemData = this.dialog.currentBoardData.items[itemElement.data('itemId')];
		if (!itemData) return false;
		const baseDimensions = this.dialog.renderer.getItemDimensions(itemData);
		const globalScale = this.dialog.currentBoardData.config.globalItemScale || 1.0;
		const scaledWidth = baseDimensions.width * globalScale;
		const scaledHeight = baseDimensions.height * globalScale;
		const visualLeft = parseInt(itemElement.css('left'), 10) - (scaledWidth - baseDimensions.width) / 2;
		const visualTop = parseInt(itemElement.css('top'), 10) - (scaledHeight - baseDimensions.height) / 2;
		const itemRect = { x: visualLeft, y: visualTop, width: scaledWidth, height: scaledHeight };
		return !(itemRect.x + itemRect.width < marqueeRect.x || itemRect.x > marqueeRect.x + marqueeRect.width ||
				 itemRect.y + itemRect.height < marqueeRect.y || itemRect.y > marqueeRect.y + marqueeRect.height);
	}

    _onBoardContextMenu(event) {
        if (this.dialog.drawingLine) {
            this._endLineDrawing();
            event.preventDefault();
            return;
        }
        if ($(event.target).closest('.clue-item').length) return;
        event.preventDefault();
        event.stopPropagation();
        this.dialog.clearAllSelections();
        
        $('body').find('.lgs-cb2-board-context-menu').remove();
        const boardCanvas = this.dialog.element.find('.clue-board-canvas');
        const rect = boardCanvas[0].getBoundingClientRect();
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;

        let menuItemsHtml = `
            <li class="add-note"><i class="fas fa-sticky-note"></i> ${game.i18n.localize("LGS_CB2.ContextMenu.AddNote")}</li>
            ${game.user.isGM ? `<li class="add-hidden-note"><i class="fas fa-user-secret"></i> ${game.i18n.localize("LGS_CB2.ContextMenu.AddHiddenNote")}</li>` : ''}
            <li class="add-clue-from-palette"><i class="fas fa-plus-square"></i> ${game.i18n.localize("LGS_CB2.ContextMenu.AddItemToBoard")}</li>`;
        
        const menu = $(`<div class="lgs-cb2-board-context-menu context-menu" style="position:absolute; z-index:1000; left: ${event.clientX}px; top: ${event.clientY}px;"><ul style="list-style:none; margin:0; padding:4px 0;">${menuItemsHtml}</ul></div>`);
        $('body').append(menu);
        
        menu.on('click', 'li.add-note', () => this._onAddNoteContext(canvasX, canvasY, false));
        if (game.user.isGM) menu.on('click', 'li.add-hidden-note', () => this._onAddNoteContext(canvasX, canvasY, true));
        menu.on('click', 'li.add-clue-from-palette', () => this._onAddClueContext(canvasX, canvasY));
        
        const closeMenu = () => menu.remove();
        menu.on('click', closeMenu);
        $(document).one('click', closeMenu);
    }

    _onItemContextMenu(event) {
        if (this.dialog.drawingLine) {
            this._endLineDrawing();
            event.preventDefault();
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const itemElement = $(event.currentTarget);
        const itemId = itemElement.data('itemId');
        const itemData = this.dialog.currentBoardData.items[itemId];
        if (!itemData || (!game.user.isGM && itemData.isHiddenFromPlayer)) return;

        if (!this.dialog.selectedItemIds.has(itemId)) {
            this.dialog.clearAllSelections();
            this.dialog.toggleItemSelected(itemId, true);
        }

        this.dialog.element.find('.item-context-menu-icons').not(itemElement.find('.item-context-menu-icons')).hide();
        const iconsContainer = itemElement.find('.item-context-menu-icons');
        if (iconsContainer.is(':visible')) {
            iconsContainer.hide();
            return;
        }
        
        iconsContainer.empty();
        const isGM = game.user.isGM;
        const isCreator = itemData.creatorUserId === game.user.id;
        const playerCanManageNotesOrNodes = !isGM && isCreator && (itemData.type === 'note' || itemData.type === 'node');
        const playerCanManageOwnImage = !isGM && isCreator && (itemData.isCustomImage || itemData.isPlaceholder) && !this.dialog.currentBoardData.config.preventPlayerMove && !itemData.isLocked;

        // Draw Connection
        iconsContainer.append($(`<a title="${game.i18n.localize('LGS_CB2.ContextMenu.DrawConnection')}"><i class="fas fa-project-diagram"></i></a>`).on('click', (e) => { e.stopPropagation(); iconsContainer.hide(); this._onDrawLineStart(itemId); }));
        
        // Lock/Unlock
        if (isGM || playerCanManageNotesOrNodes || playerCanManageOwnImage) {
            iconsContainer.append($(`<a title="${itemData.isLocked ? game.i18n.localize('LGS_CB2.ContextMenu.UnlockItem') : game.i18n.localize('LGS_CB2.ContextMenu.LockItem')}"><i class="fas ${itemData.isLocked ? 'fa-lock' : 'fa-lock-open'}"></i></a>`).on('click', (e) => { e.stopPropagation(); iconsContainer.hide(); this._onToggleItemLock(itemId); }));
        }

        // Configure
        let showCog = isGM || (itemData.type === 'note' && isCreator) || (itemData.type !== 'note' && itemData.type !== 'node');
        if (showCog) iconsContainer.append($(`<a title="${game.i18n.localize('LGS_CB2.ContextMenu.ConfigureItem')}"><i class="fas fa-cog"></i></a>`).on('click', (e) => { e.stopPropagation(); iconsContainer.hide(); this._onConfigureItem(itemId); }));

        // Delete
        if (isGM || playerCanManageNotesOrNodes || playerCanManageOwnImage) {
            iconsContainer.append($(`<a title="${game.i18n.localize('LGS_CB2.ContextMenu.DeleteItem')}"><i class="fas fa-trash"></i></a>`).on('click', (e) => { e.stopPropagation(); iconsContainer.hide(); this._onDeleteItem(itemId); }));
        }

        // View Image
        if ((itemData.type === 'actor' || itemData.isCustomImage || itemData.isPlaceholder) && (isGM || !itemData.isBlurred)) {
            iconsContainer.append($(`<a title="${game.i18n.localize('LGS_CB2.ContextMenu.ViewImage')}"><i class="fas fa-eye"></i></a>`).on('click', (e) => { e.stopPropagation(); iconsContainer.hide(); this._onViewImage(itemId); }));
        }
        
        iconsContainer.show();
    }
    
    _onDrawLineStart(fromItemId) {
        this.dialog.clearAllSelections();
        this.dialog.element.find('.item-context-menu-icons').hide();
        this.dialog.drawingLine = true;
        this.dialog.lineFromItemId = fromItemId;
        this.dialog.element.find('.clue-board-canvas').addClass('drawing-line');
        
        const svg = this.dialog.element.find('.connections-svg');
        const fromCenter = this.dialog.renderer.getItemCenter(this.dialog.currentBoardData.items[fromItemId]);
        if (!fromCenter) { this._endLineDrawing(); return; }
        
        this.dialog.tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        this.dialog.tempLine.setAttribute('x1', fromCenter.x);
        this.dialog.tempLine.setAttribute('y1', fromCenter.y);
        this.dialog.tempLine.setAttribute('x2', fromCenter.x);
        this.dialog.tempLine.setAttribute('y2', fromCenter.y);
        this.dialog.tempLine.setAttribute('stroke', 'red');
        this.dialog.tempLine.setAttribute('stroke-width', '3');
        this.dialog.tempLine.setAttribute('stroke-dasharray', '5,5');
        svg.append(this.dialog.tempLine);
        ui.notifications.info(game.i18n.localize('LGS_CB2.Notifications.DrawConnectionHelp'));
    }

    _updateTempLine(event) {
        const boardCanvas = this.dialog.element.find('.clue-board-canvas');
        const rect = boardCanvas[0].getBoundingClientRect();
        this.dialog.tempLine.setAttribute('x2', event.clientX - rect.left);
        this.dialog.tempLine.setAttribute('y2', event.clientY - rect.top);
    }
    
    _endLineDrawing() {
        this.dialog.element?.find('.clue-board-canvas').removeClass('drawing-line');
        this.dialog.tempLine?.remove();
        this.dialog.tempLine = null;
        this.dialog.drawingLine = false;
        this.dialog.lineFromItemId = null;
    }

    async _createConnection(fromItemId, toItemId) {
        const existing = this.dialog.currentBoardData.connections.find(c => (c.fromItemId === fromItemId && c.toItemId === toItemId) || (c.fromItemId === toItemId && c.toItemId === fromItemId));
        if (existing) return ui.notifications.warn(game.i18n.localize('LGS_CB2.Notifications.ConnectionExists'));

        if (game.user.isGM) {
            await ClueBoardData.addConnection(this.dialog.boardId, fromItemId, toItemId);
        } else {
            const tempConnection = { id: foundry.utils.randomID(), fromItemId, toItemId, creatorUserId: game.user.id };
            this.dialog.currentBoardData.connections.push(tempConnection);
            this.dialog.renderer.renderCustomElements();
            socketController.requestAddConnection(this.dialog.boardId, fromItemId, toItemId);
        }
        ui.notifications.info(game.i18n.localize('LGS_CB2.Notifications.ConnectionCreated'));
    }

    async _onToggleItemLock(itemId) {
        const item = this.dialog.currentBoardData.items[itemId];
        const isGM = game.user.isGM;
        const isCreator = item.creatorUserId === game.user.id;
        let canToggle = isGM || 
                        (isCreator && (item.type === 'note' || item.type === 'node')) ||
                        (isCreator && (item.isCustomImage || item.isPlaceholder) && !this.dialog.currentBoardData.config.preventPlayerMove);
        if (!canToggle) return ui.notifications.warn(game.i18n.localize("LGS_CB2.Notifications.CannotToggleLock"));
        
        await ClueBoardData.updateItem(this.dialog.boardId, itemId, { isLocked: !item.isLocked });
    }

    _onConfigureItem(itemId) {
        const itemData = this.dialog.currentBoardData.items[itemId];
        this.dialog.clearAllSelections();
        const isGM = game.user.isGM;
        const isCreator = itemData.creatorUserId === game.user.id;

        if (itemData.type === 'note') {
            if (isGM || isCreator) new AddNoteDialog(this.dialog.boardId, itemId).render(true);
        } else if (itemData.type === 'actor' || itemData.isCustomImage || itemData.isPlaceholder) {
            if (isGM || !itemData.lockClueName) new ClueItemConfigDialog(this.dialog.boardId, itemId, this.dialog, { playerEditMode: !isGM }).render(true);
            else ui.notifications.warn(game.i18n.localize("LGS_CB2.Notifications.ItemNameLocked"));
        } else if (itemData.type === 'node' && isGM) {
            new ClueNodeConfigDialog(this.dialog.boardId, itemId, this.dialog).render(true);
        }
    }

	async _onDeleteItem(itemId) {
		const item = this.dialog.currentBoardData.items[itemId];
        if (!item) return;
		const isGM = game.user.isGM;
		const isCreator = item.creatorUserId === game.user.id;
		const canDelete = isGM || (isCreator && !item.isLocked && ( (item.type === 'note' || item.type === 'node') || (!this.dialog.currentBoardData.config.preventPlayerMove) ) );
		if (!canDelete) return ui.notifications.warn(game.i18n.localize("LGS_CB2.Notifications.CannotDeleteItem"));

		const confirmed = await Dialog.confirm({
			title: game.i18n.format("LGS_CB2.Confirmations.DeleteItemTitle", { type: item.clueName || item.type || 'Item' }),
			content: `<p>${game.i18n.format("LGS_CB2.Confirmations.DeleteItemContent", { type: item.clueName || item.type || 'item' })}</p>`
		});

		if (confirmed) {
            // Optimistic update
            if (this.dialog.selectedItemIds.has(itemId)) this.dialog.toggleItemSelected(itemId, false); 
            delete this.dialog.currentBoardData.items[itemId];
            this.dialog.currentBoardData.connections = this.dialog.currentBoardData.connections.filter(c => c.fromItemId !== itemId && c.toItemId !== itemId);
            delete this.dialog.currentBoardData.itemSelections?.[itemId];
            this.dialog.render(false);

            if (isGM) await ClueBoardData.deleteItem(this.dialog.boardId, itemId);
            else socketController.requestDeleteItem(this.dialog.boardId, itemId);
		}
	}

    _onViewImage(itemId) {
        const itemData = this.dialog.currentBoardData.items[itemId];
        const itemIsBlurredOnBoardForPlayer = !game.user.isGM && itemData.isBlurred;
        new RevealImageDialog(itemData.img, itemIsBlurredOnBoardForPlayer).render(true);
    }
    
    _onAddNoteContext(x, y, isHidden = false) {
        this.dialog.clearAllSelections();
        const topLeftX = x - DEFAULT_NOTE_WIDTH / 2;
        const topLeftY = y - DEFAULT_NOTE_HEIGHT / 2;
        new AddNoteDialog(this.dialog.boardId, { x: topLeftX, y: topLeftY, isHiddenFromPlayer: isHidden }).render(true);
    }

    _onAddClueContext(x, y) {
        this.dialog.clearAllSelections();
        new AddClueDialog(this.dialog.boardId, {x, y}, this.dialog).render(true);
    }

    _getNextNodeCounter() {
        const counters = Object.values(this.dialog.currentBoardData.items)
            .filter(item => item.type === 'node' && typeof item.circleCounter === 'number')
            .map(item => item.circleCounter)
            .sort((a, b) => a - b);
        if (counters.length === 0) return 1;
        for (let i = 0; i < counters.length; i++) {
            if (counters[i] !== i + 1) return i + 1; 
        }
        return counters[counters.length - 1] + 1;
    }

    async _onDrop(event) {
        this.dialog.clearAllSelections();
		try {
			const data = JSON.parse(event.dataTransfer.getData('text/plain'));
            if (!data || (data.boardId && data.boardId !== this.dialog.boardId)) return;

            const boardCanvas = this.dialog.element.find('.clue-board-canvas');
			const rect = boardCanvas[0].getBoundingClientRect();
			let dropX = event.clientX - rect.left;
			let dropY = event.clientY - rect.top;

            let newItemData = null;
            const isGM = game.user.isGM;
            const hideItemFromPlayer = isGM && (data.hideAddedItemFromPlayer || false);

            if (data.type === "Actor" && isGM) {
				const actor = fromUuidSync(data.uuid);
				if (actor) {
					newItemData = this._createActorItemData(actor, dropX, dropY, hideItemFromPlayer, event.ctrlKey, actor.name);
				}
			} else if (data.type === "CluePaletteItem") {
                if (data.clueType === 'actor' && isGM) {
                    const actor = game.actors.get(data.actorId);
                    if (actor) {
                        const clueName = data.useActorName ? actor.name : this._generateDefaultClueName();
                        newItemData = this._createActorItemData(actor, dropX, dropY, hideItemFromPlayer, event.ctrlKey, clueName);
                    }
                } else if (data.clueType === 'node' && isGM) {
                    newItemData = this._createNodeItemData(dropX, dropY);
                } else if (data.clueType === 'placeholder-actor-image') {
                    newItemData = this._createPlaceholderItemData(dropX, dropY, hideItemFromPlayer && isGM, event.ctrlKey && isGM);
                }
            }

			if (newItemData) {
                const boardConfig = this.dialog.currentBoardData.config;
                const dims = this.dialog.renderer.getItemDimensions(newItemData);
                if (newItemData.type === 'node') {
                    newItemData.x = Math.clamped(newItemData.x, dims.width / 2, boardConfig.width - dims.width / 2);
                    newItemData.y = Math.clamped(newItemData.y, dims.height / 2, boardConfig.height - dims.height / 2);
                } else {
                    newItemData.x = Math.clamped(newItemData.x, 0, boardConfig.width - dims.width);
                    newItemData.y = Math.clamped(newItemData.y, 0, boardConfig.height - dims.height);
                }

                if (isGM) {
                    await ClueBoardData.addItem(this.dialog.boardId, newItemData);
                } else {
                    socketController.requestAddItemToServer(this.dialog.boardId, newItemData);
                }
			}
		} catch (err) { /* Silently fail on non-JSON drop data */ }
	}

    _createActorItemData(actor, dropX, dropY, isHidden, isBlurred, name) {
        const width = DEFAULT_ACTOR_ITEM_WIDTH;
        const height = DEFAULT_ACTOR_ITEM_HEIGHT;
        return {
            type: 'actor', actorId: actor.id, img: actor.img || CONST.DEFAULT_TOKEN,
            x: dropX - width / 2, y: dropY - height / 2, width, height,
            clueName: name, isHiddenFromPlayer: isHidden,
            isBlurred: isBlurred || this.dialog.currentBoardData.config.blurPlacedImages,
            creatorUserId: game.user.id, imageFrameType: 'board_default'
        };
    }

    _createNodeItemData(dropX, dropY) {
        const counter = this._getNextNodeCounter();
        return {
            type: 'node', x: dropX, y: dropY, width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT,
            isLocked: false, circleCounter: counter, clueName: `Node ${counter}`,
            creatorUserId: game.user.id
        };
    }

    _createPlaceholderItemData(dropX, dropY, isHidden, isBlurred) {
        const width = DEFAULT_ACTOR_ITEM_WIDTH;
        const height = DEFAULT_ACTOR_ITEM_HEIGHT;
        return {
            type: 'actor', actorId: null, isCustomImage: false, isPlaceholder: true,
            img: PLACEHOLDER_IMAGE_PATH, clueName: this._generateDefaultClueName(),
            x: dropX - width / 2, y: dropY - height / 2, width, height,
            isHiddenFromPlayer: isHidden,
            isBlurred: isBlurred || this.dialog.currentBoardData.config.blurPlacedImages,
            creatorUserId: game.user.id, imageFrameType: 'board_default'
        };
    }

    _generateDefaultClueName() {
        const count = Object.values(this.dialog.currentBoardData.items).filter(it => it.type === 'actor' || it.isCustomImage || it.isPlaceholder).length + 1;
        return game.i18n.format("LGS_CB2.DefaultPlaceholderClueNameNumbered", { number: count });
    }
}```

---
### **File 5: `ClueBoardDialog.js` (Modified)**
This is the main application file, now refactored to be a cleaner "controller" that delegates tasks to the renderer and interaction manager.

```js
// scripts/ClueBoardDialog.js
import { MODULE_ID, TEMPLATES } from './constants.js';
import { ClueBoardData } from './ClueBoardData.js';
import { ClueBoardInteractionManager } from './ClueBoardInteractionManager.js';
import { ClueBoardRenderer } from './ClueBoardRenderer.js';

export class ClueBoardDialog extends Application {
	constructor(boardId, options = {}) {
		super(options);
		this.boardId = boardId;
		this.currentBoardData = ClueBoardData.getBoardData(boardId);

        this.renderer = new ClueBoardRenderer(this);
        this.interactionManager = new ClueBoardInteractionManager(this);
		
		// Interaction States
		this.draggingItem = null;
		this.dragOffset = { x: 0, y: 0 };
		this.drawingLine = false;
		this.lineFromItemId = null;
		this.tempLine = null;
		this.isMarqueeSelecting = false;
		this.marqueeStartPos = { x: 0, y: 0 };
		this.marqueeRectDiv = null;
		this.justFinishedMarquee = false;
		this.selectedItemIds = new Set();
		this.multiDragInitialPositions = new Map();
		this.isMultiDragging = false;
        this.lastDragUpdateTime = 0;
        this.dragUpdateThrottleMs = 50;

        // UI States
		this._nodeCountersVisible = false; 
		this._highlightedNodeForCounter = null;
		this._previewingItemId = null; 
		this._originalPreviewItemData = null;
	}

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: `${MODULE_ID}-board`, 
            template: TEMPLATES.CLUE_BOARD_DIALOG,
            popOut: true,
            resizable: true,
            classes: [MODULE_ID, "clue-board-app"],
            dragDrop: [ { dropSelector: ".clue-board-canvas" } ],
        });
    }

    get title() {
        return game.i18n.format('LGS_CB2.ClueBoardDialogTitle', { name: this.currentBoardData?.name || 'Loading...' });
    }
    
    get id() {
        return `${MODULE_ID}-board-${this.boardId}`;
    }

    async getData(options) {
        this.currentBoardData = ClueBoardData.getBoardData(this.boardId) || this.currentBoardData;
        if (!this.currentBoardData) {
            ui.notifications.error(`Clue Board with ID ${this.boardId} not found.`);
            this.close({force: true}); 
            return {}; 
        }

        // Ensure default properties exist
        this.currentBoardData.config = this.currentBoardData.config || {};
        foundry.utils.mergeObject(this.currentBoardData.config, {
            globalItemScale: 1.0, imageFrameType: "photo",
            width: 1000, height: 1000
        }, {inplace: true, insertKeys: true, insertValues: false});
        this.currentBoardData.itemSelections ??= {};

        this.options.width = this.currentBoardData.config.width + 40; 
        this.options.height = this.currentBoardData.config.height + 70;

        return {
            board: this.currentBoardData,
            isGM: game.user.isGM,
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        this.interactionManager.activateListeners(html);
    }
	
    _canDragDrop(selector) { return true; }

    _onDrop(event) { this.interactionManager._onDrop(event); }

    async _render(force = false, options = {}) {
        const oldSelectedIds = new Set(this.selectedItemIds);
        await this.getData(); // Refresh data before render

        // Clean up stale selections for the current user
        for (const itemId in this.currentBoardData.itemSelections) {
            if (this.currentBoardData.itemSelections[itemId]?.includes(game.user.id) && !this.selectedItemIds.has(itemId)) {
                ClueBoardData.removeUserSelectionFromItem(this.boardId, itemId, game.user.id);
            }
        }

        await super._render(force, options); 
        
        if (this.rendered) {
            this.renderer.renderCustomElements();
            if (this._nodeCountersVisible) this.showNodeCounters(true, this._highlightedNodeForCounter);
            
            this.selectedItemIds = oldSelectedIds;
            this.updateAllSelectedItemsVisuals();
        }
    }
	
    async close(options = {}) { 
        this.interactionManager._endLineDrawing();
        this.marqueeRectDiv?.remove();
        this.marqueeRectDiv = null;
        $(document).off(`.clueboard-${this.boardId} .clueboardglobal-${this.boardId} .clueboard-hidecontext-${this.boardId}`);
        
        // Remove user's selections from the server on close
        if (this.currentBoardData?.itemSelections) {
            for (const itemId in this.currentBoardData.itemSelections) {
                if (this.currentBoardData.itemSelections[itemId].includes(game.user.id)) {
                    ClueBoardData.removeUserSelectionFromItem(this.boardId, itemId, game.user.id);
                }
            }
        }
        this.clearAllSelections(false); 
        return super.close(options);
    }

    // --- State & Appearance Management ---

    toggleItemSelected(itemId, forceState = null) {
        const isSelected = forceState ?? !this.selectedItemIds.has(itemId);
        if (isSelected) this.selectedItemIds.add(itemId);
        else this.selectedItemIds.delete(itemId);
        
        this.applyItemHighlight(itemId, isSelected); 

        if (isSelected) ClueBoardData.addUserSelectionToItem(this.boardId, itemId, game.user.id);
        else ClueBoardData.removeUserSelectionFromItem(this.boardId, itemId, game.user.id);
    }

    clearAllSelections(notifyServer = true) {
        this.selectedItemIds.forEach(id => {
            this.applyItemHighlight(id, false); 
            if (notifyServer) ClueBoardData.removeUserSelectionFromItem(this.boardId, id, game.user.id); 
        });
        this.selectedItemIds.clear();
    }

    applyItemHighlight(itemId, isHighlighted) {
        this.element?.find(`.clue-item[data-item-id="${itemId}"]`).toggleClass('item-selected-highlight', isHighlighted);
    }

    updateAllSelectedItemsVisuals() {
        this.element?.find('.clue-item').each((_, el) => {
            const $el = $(el);
            $el.toggleClass('item-selected-highlight', this.selectedItemIds.has($el.data('itemId')));
        });
    }
    
    updateAppearance(configChanges) {
        if (!this.rendered) return;
        const boardCanvas = this.element.find('.clue-board-canvas');
        let needsReRender = false;

        if (configChanges.width !== undefined) boardCanvas.css('width', configChanges.width + 'px');
        if (configChanges.height !== undefined) boardCanvas.css('height', configChanges.height + 'px');
        this.setPosition({ width: (configChanges.width ?? this.currentBoardData.config.width) + 40, height: (configChanges.height ?? this.currentBoardData.config.height) + 70 });

        if (configChanges.backgroundImage !== undefined) boardCanvas.css('background-image', `url('${configChanges.backgroundImage}')`);
        if (configChanges.backgroundScaleX !== undefined || configChanges.backgroundScaleY !== undefined) {
            boardCanvas.css('background-size', `${configChanges.backgroundScaleX ?? this.currentBoardData.config.backgroundScaleX}px ${configChanges.backgroundScaleY ?? this.currentBoardData.config.backgroundScaleY}px`);
        }
        
        if (configChanges.globalItemScale !== undefined || configChanges.imageFrameType !== undefined) {
            this.currentBoardData.config.globalItemScale = parseFloat(configChanges.globalItemScale ?? this.currentBoardData.config.globalItemScale);
            this.currentBoardData.config.imageFrameType = configChanges.imageFrameType ?? this.currentBoardData.config.imageFrameType;
            needsReRender = true;
        }

        if (needsReRender) this.render(false);
        else this.renderer.renderCustomElements();
    }

	async previewItemUpdate(itemId, updatedItemData) {
		if (!this.currentBoardData?.items?.[itemId]) return;
		if (this._previewingItemId !== itemId) {
			this._previewingItemId = itemId;
			this._originalPreviewItemData = foundry.utils.deepClone(ClueBoardData.getBoardData(this.boardId).items[itemId]);
		}

		this.currentBoardData.items[itemId] = foundry.utils.mergeObject(this._originalPreviewItemData, updatedItemData);
		this.render(false);
	}
	
    clearItemPreview(itemId, maintainCurrentState = false) {
        if (this._previewingItemId === itemId && this._originalPreviewItemData) {
            if (!maintainCurrentState) {
                this.currentBoardData.items[itemId] = this._originalPreviewItemData;
            }
        }
        this._previewingItemId = null;
        this._originalPreviewItemData = null;
    }

    showNodeCounters(visible, highlightedNodeId = null) {
        this._nodeCountersVisible = visible;
        this._highlightedNodeForCounter = highlightedNodeId;
        if (!this.element) return;

        this.element.find('.clue-item.node-item').each((_, el) => {
            const itemElement = $(el);
            const itemId = itemElement.data('itemId');
            const itemData = this.currentBoardData.items[itemId];
            itemElement.find('.node-counter-display').remove();
            if (visible && itemData?.circleCounter != null && !(!game.user.isGM && itemData.isHiddenFromPlayer)) {
                $(`<div class="node-counter-display">${itemData.circleCounter}</div>`)
                    .toggleClass('highlighted', itemId === highlightedNodeId)
                    .appendTo(itemElement);
            }
        });
    }

    _handleRemoteItemDragUpdate(itemsData) {
        if (!this.rendered) return;
        itemsData.forEach(itemUpdate => {
            const itemElement = this.element.find(`.clue-item[data-item-id="${itemUpdate.itemId}"]`);
            if (itemElement.length) {
                itemElement.css({ left: itemUpdate.left + 'px', top: itemUpdate.top + 'px' });
                this.renderer.updateConnectionsForItem(itemUpdate.itemId);
            }
        });
        this.renderer.renderCustomElements();
    }
}