import { MODULE_ID, TEMPLATES, DEFAULT_ACTOR_ITEM_WIDTH, DEFAULT_ACTOR_ITEM_HEIGHT, DEFAULT_NOTE_WIDTH, DEFAULT_NOTE_HEIGHT, NODE_RADIUS, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT, PLACEHOLDER_IMAGE_PATH } from './constants.js';
import { ClueBoardData } from './ClueBoardData.js';
import { ClueBoardConfigDialog } from './ClueBoardConfigDialog.js';
import { AddNoteDialog } from './AddNoteDialog.js';
import { ClueItemConfigDialog } from './ClueItemConfigDialog.js';
import { AddClueDialog } from './AddClueDialog.js';
import { ClueNodeConfigDialog } from './ClueNodeConfigDialog.js';
import { RevealImageDialog } from './RevealImageDialog.js'; 
import { socketController } from './SocketController.js'; 

export class ClueBoardDialog extends Application {
	constructor(boardId, options = {}) {
		super(options);
		this.boardId = boardId;
		this.currentBoardData = ClueBoardData.getBoardData(boardId);

        if (this.currentBoardData && this.currentBoardData.config) {
            const boardWidth = this.currentBoardData.config.width || 1000;
            const boardHeight = this.currentBoardData.config.height || 1000;
            const dialogWidth = boardWidth + 40;
            const dialogHeight = boardHeight + 70;

            if (dialogWidth > window.innerWidth || dialogHeight > window.innerHeight) {
                this.options.resizable = true;
            } else {
                this.options.resizable = false;
            }
        } else {
            this.options.resizable = true;
        }
		
		// Single item drag state
		this.draggingItem = null; // The jQuery element of the item being dragged (primary in multi-drag)
		this.dragOffset = { x: 0, y: 0 }; // Offset of mouse within the primary dragging item

		// Line drawing state
		this.drawingLine = false;
		this.lineFromItemId = null;
		this.tempLine = null;

		// Node counter state
		this._nodeCountersVisible = false; 
		this._highlightedNodeForCounter = null; 

		// Preview state
		this._previewingItemId = null; 
		this._originalPreviewItemData = null;

		// Marquee selection state
		this.isMarqueeSelecting = false;
		this.marqueeStartPos = { x: 0, y: 0 }; // Canvas-relative coordinates
		this.marqueeRectDiv = null; // The visual marquee rectangle DOM element
		this.justFinishedMarquee = false; // NEW: Flag to prevent clearing selections after marquee

		// Multi-selection and multi-drag state
		this.selectedItemIds = new Set(); // Set of item IDs that are currently selected/highlighted (LOCAL USER'S GREEN HIGHLIGHT)
		this.multiDragInitialPositions = new Map(); // Map<itemId, {x, y}> stores initial data positions of selected items at drag start
		this.isMultiDragging = false;

        // Real-time drag update throttling
        this.lastDragUpdateTime = 0;
        this.dragUpdateThrottleMs = 50; // Approx 20 updates per second
	}

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: `${MODULE_ID}-board`, 
            template: TEMPLATES.CLUE_BOARD_DIALOG,
            popOut: true,
            resizable: true,
            classes: [MODULE_ID, "clue-board-app"],
            dragDrop: [
                { dragSelector: null, dropSelector: ".clue-board-canvas" } 
            ],
        });
    }

    get title() {
        return game.i18n.format('LGS_CB2.ClueBoardDialogTitle', { name: this.currentBoardData?.name || 'Loading...' });
    }
    
    get id() {
        return `${MODULE_ID}-board-${this.boardId}`;
    }

    async getData(options) {
        if (!this.currentBoardData) {
            this.currentBoardData = ClueBoardData.getBoardData(this.boardId);
            if (!this.currentBoardData) {
                ui.notifications.error(`Clue Board with ID ${this.boardId} not found.`);
                if (this.rendered) this.close({force: true}); 
                return {}; 
            }
        }
        this.currentBoardData.config = this.currentBoardData.config || {};
        if (typeof this.currentBoardData.config.globalItemScale === 'undefined') {
            this.currentBoardData.config.globalItemScale = 1.0;
        }
        if (typeof this.currentBoardData.config.imageFrameType === 'undefined') {
            this.currentBoardData.config.imageFrameType = "photo";
        }
        if (typeof this.currentBoardData.config.width === 'undefined') {
            this.currentBoardData.config.width = 1000; 
        }
        if (typeof this.currentBoardData.config.height === 'undefined') {
            this.currentBoardData.config.height = 1000; 
        }
        // Ensure itemSelections exists
        if (typeof this.currentBoardData.itemSelections === 'undefined') {
            this.currentBoardData.itemSelections = {};
        }


        this.options.width = this.currentBoardData.config.width + 40; 
        this.options.height = this.currentBoardData.config.height + 70;

        return {
            board: this.currentBoardData,
            isGM: game.user.isGM,
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        const boardCanvas = html.find('.clue-board-canvas');
        if (!boardCanvas.length) {
            return;
        }
		
		boardCanvas.on('dragover', (event) => {
            event.preventDefault(); 
        });
        boardCanvas.on('drop', (event) => { /* Handled by _onDrop via Foundry */ });

        if (game.user.isGM) {
            html.find('.clue-board-config-button')
                .on('click', this._onConfigButtonClick.bind(this));

            const gmNotePreviewDiv = html.find('.gm-note-preview');
            if (gmNotePreviewDiv.length) {
                boardCanvas.on('mouseenter', '.clue-item', (event) => {
                    const itemElement = $(event.currentTarget);
                    const itemId = itemElement.data('itemId');
                    const itemData = this.currentBoardData.items[itemId];
                    if (itemData) {
                        // MODIFICATION: Check for gmText on notes, or gmNotes on other items.
                        const gmContent = itemData.type === 'note' ? itemData.gmText : itemData.gmNotes;
                        if (gmContent && gmContent.trim() !== "") {
                            gmNotePreviewDiv.find('.gm-note-preview-content').html(gmContent);
                            gmNotePreviewDiv.show();
                        }
                    }
                });
                boardCanvas.on('mouseleave', '.clue-item', (event) => {
                    gmNotePreviewDiv.hide();
                    gmNotePreviewDiv.find('.gm-note-preview-content').empty();
                });
            }
        }

        // Item interactions
        boardCanvas.on('mousedown', '.clue-item', this._onItemMouseDown.bind(this));
        boardCanvas.on('contextmenu', '.clue-item', this._onItemContextMenu.bind(this));

        // Canvas interactions (clicks, marquee, context menu)
        boardCanvas.on('mousedown', this._onBoardCanvasMouseDown.bind(this)); // For marquee primarily
        boardCanvas.on('click', this._onBoardCanvasClick.bind(this)); // For line drawing end, deselect
        boardCanvas.on('mousemove', this._onBoardCanvasMouseMove.bind(this)); // For line drawing
        boardCanvas.on('contextmenu', this._onBoardContextMenu.bind(this)); // Board context menu

        // Document level listeners for specific contexts
        $(document).off(`click.clueboard-hidecontext-${this.boardId}`);
        $(document).on(`click.clueboard-hidecontext-${this.boardId}`, (event) => {
            const target = $(event.target);
            const isItemContextMenuIcon = target.closest('.item-context-menu-icons').length > 0;
            const isClueItem = target.closest('.clue-item').length > 0;
            const isStandardContextMenu = target.closest('.context-menu').length > 0;

            if (isClueItem && !isItemContextMenuIcon && !isStandardContextMenu) {
                 this.element.find('.item-context-menu-icons').hide();
                 return;
            }
            
            if (!isClueItem && !isItemContextMenuIcon && !isStandardContextMenu) {
                this.element.find('.item-context-menu-icons').hide();
            }
        });
    }
	
    _canDragDrop(dragData) {
      return true;
    }

    _getItemDimensions(item) {
        if (!item) return { width: 0, height: 0 };
        let width, height;
        let boardConfigForFrameType = this.currentBoardData?.config;
         if (this._previewingItemId && this._originalPreviewItemData && this.clueBoardApp?.currentBoardData) {
             const openBoardDialog = Object.values(ui.windows).find(w => w.id === `${MODULE_ID}-board-${this.boardId}`);
             if (openBoardDialog && openBoardDialog.currentBoardData) {
                 boardConfigForFrameType = openBoardDialog.currentBoardData.config;
             }
         }

        let effectiveFrameType = item.imageFrameType;
        if (item.imageFrameType === 'board_default' || typeof item.imageFrameType === 'undefined') {
            const boardDefaultFrameType = boardConfigForFrameType?.imageFrameType || "photo";
            effectiveFrameType = boardDefaultFrameType;
        }

        if (item.type === 'actor' || item.isCustomImage || item.isPlaceholder) { 
            width = item.width || DEFAULT_ACTOR_ITEM_WIDTH;
            height = item.height || DEFAULT_ACTOR_ITEM_HEIGHT;
            if (effectiveFrameType === 'circle') {
                const size = (item.width === item.height) ? item.width : Math.max(width, height);
                width = size;
                height = size;
            }
        } else if (item.type === 'note') {
            width = item.width || DEFAULT_NOTE_WIDTH;
            height = item.height || DEFAULT_NOTE_HEIGHT;
        } else if (item.type === 'node') {
            width = item.width || DEFAULT_NODE_WIDTH; 
            height = item.height || DEFAULT_NODE_HEIGHT;
        } else {
            width = item.width || 100;
            height = item.height || 100;
        }
        return { width, height };
    }

    _getItemCenter(itemElementOrData, isDraggingThisItem = false) {
        let itemData, currentX_topLeft, currentY_topLeft;
        const isElement = itemElementOrData instanceof jQuery;

        if (isElement) {
            const itemId = itemElementOrData.data('itemId');
            itemData = this.currentBoardData.items[itemId];
            if (!itemData) return { x: 0, y: 0 };
            currentX_topLeft = parseInt(itemElementOrData.css('left'), 10);
            currentY_topLeft = parseInt(itemElementOrData.css('top'), 10);
        } else {
            itemData = itemElementOrData;
            if (!itemData) return { x: 0, y: 0 };
            if (itemData.type === 'node') { 
                return { x: itemData.x, y: itemData.y };
            }
            currentX_topLeft = itemData.x;
            currentY_topLeft = itemData.y;
        }
        
        const dimensions = this._getItemDimensions(itemData);
        return {
            x: currentX_topLeft + dimensions.width / 2,
            y: currentY_topLeft + dimensions.height / 2
        };
    }

    _onBoardCanvasMouseDown(event) {
        if (event.button !== 0 || this.drawingLine) return; // Only left click, not if drawing line
        const targetIsItem = $(event.target).closest('.clue-item').length > 0;

        if (!targetIsItem) { // Clicked on empty canvas space
            this._startMarqueeSelection(event);
        }
        // If it's an item, _onItemMouseDown will handle it.
    }

	_onBoardCanvasClick(event) {
		// End line drawing if active
		if (this.drawingLine && this.lineFromItemId) {
			let connectionAttempted = false;
			let itemClickedToFinishLine = false;
			try {
				const clickedItemElement = $(event.target).closest('.clue-item');
				if (clickedItemElement.length) {
					itemClickedToFinishLine = true;
					const toItemId = clickedItemElement.data('itemId');
					const toItemData = this.currentBoardData.items[toItemId];

					if (toItemId && toItemData) {
						if (!game.user.isGM && toItemData.isHiddenFromPlayer) {
							ui.notifications.warn(game.i18n.localize("LGS_CB2.Notifications.CannotConnectToHiddenItem"));
						} else if (toItemId !== this.lineFromItemId) {
							connectionAttempted = true;
							this._createConnection(this.lineFromItemId, toItemId)
								.catch(err => {
									// console.error(`${MODULE_ID} | Async error during _createConnection:`, err);
								});
						} else {
							ui.notifications.warn(game.i18n.localize("LGS_CB2.Notifications.CannotConnectItemToItself"));
						}
					} else if (toItemId) {
						ui.notifications.warn("Target item for connection not found in board data.");
					}
				}
			} catch (e) {
				// console.error(`${MODULE_ID} | Sync error in _onBoardCanvasClick line drawing:`, e);
			} finally {
				this._endLineDrawing();
				this.currentBoardData = ClueBoardData.getBoardData(this.boardId); 
				this._renderConnections(); 
				if (itemClickedToFinishLine || connectionAttempted) { 
					event.stopPropagation();
				}
			}
			return; 
		}

		// Check if we just finished a marquee selection
		if (this.justFinishedMarquee) {
			this.justFinishedMarquee = false; // Reset the flag
			return; // Don't clear selections
		}

		// If not dragging, marquee selecting, or clicking on UI elements, clear selections
		if (!this.isMarqueeSelecting && !this.draggingItem && !this.isMultiDragging &&
			!$(event.target).closest('.clue-item, .context-menu, .item-context-menu-icons').length) {
			this._clearAllSelections(); // This will also handle removing user's colored circles
			this.element.find('.item-context-menu-icons').hide();
		}
	}

    _onBoardCanvasMouseMove(event) {
        if (this.isMarqueeSelecting && this.marqueeRectDiv) {
            this._updateMarqueeSelection(event);
        } else if (this.drawingLine && this.lineFromItemId && this.tempLine) {
            const boardCanvas = this.element.find('.clue-board-canvas');
            const rect = boardCanvas[0].getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            this.tempLine.setAttribute('x2', mouseX);
            this.tempLine.setAttribute('y2', mouseY);
        } else if (this.draggingItem || this.isMultiDragging) { // Handle general item drag (single or multi)
            this._onDragMouseMove(event);
        }
    }

    _onBoardCanvasMouseUp(event) { // Renamed and generalized from _onItemMouseUp
        if (this.isMarqueeSelecting) {
            this._endMarqueeSelection(event);
        } else if (this.draggingItem || this.isMultiDragging) {
            this._onDragMouseUp(event);
        }
        // Remove document listeners if they were added by drag/marquee
        $(document).off(`mousemove.clueboardglobal-${this.boardId}`);
        $(document).off(`mouseup.clueboardglobal-${this.boardId}`);
    }


    _onBoardContextMenu(event) {
        if (this.drawingLine) {
            this._endLineDrawing();
            event.preventDefault();
            return;
        }
        if ($(event.target).closest('.clue-item').length) return; // Item context menu handles this
        event.preventDefault();
        event.stopPropagation();
        this._clearAllSelections(); // Clear selections when opening board context menu
        $('body').find('.lgs-cb2-board-context-menu').remove();
        const boardCanvas = this.element.find('.clue-board-canvas');
        if (!boardCanvas.length) return;
        const rect = boardCanvas[0].getBoundingClientRect();
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;
        
        let menuItemsHtml = `
            <li class="add-note" style="padding:4px 12px; cursor:pointer;">
                <i class="fas fa-sticky-note"></i>
                ${game.i18n.localize("LGS_CB2.ContextMenu.AddNote")}
            </li>`;
        
        if (game.user.isGM) {
            menuItemsHtml += `
            <li class="add-hidden-note" style="padding:4px 12px; cursor:pointer;">
                <i class="fas fa-user-secret"></i>
                ${game.i18n.localize("LGS_CB2.ContextMenu.AddHiddenNote")}
            </li>`;
        }

        menuItemsHtml += `
            <li class="add-clue-from-palette" style="padding:4px 12px; cursor:pointer;">
                 <i class="fas fa-plus-square"></i>
                 ${game.i18n.localize("LGS_CB2.ContextMenu.AddItemToBoard")} 
            </li>`;

        const menu = $(`
          <div class="lgs-cb2-board-context-menu context-menu" style="position:absolute; z-index:1000;">
            <ul style="margin:0; padding:4px 0; list-style:none;">
              ${menuItemsHtml}
            </ul>
          </div>
        `);
        $('body').append(menu);
        const menuX = event.clientX;
        const menuY = event.clientY;
        menu.css({ left: `${menuX}px`, top: `${menuY}px` });
        
        menu.on('click', 'li.add-note', () => {
          this._onAddNoteContext(canvasX, canvasY, false); 
          menu.remove();
        });
        if (game.user.isGM) {
            menu.on('click', 'li.add-hidden-note', () => {
              this._onAddNoteContext(canvasX, canvasY, true); 
              menu.remove();
            });
        }
        menu.on('click', 'li.add-clue-from-palette', () => { 
          this._onAddClueContext(canvasX, canvasY); 
          menu.remove();
        });
        $(document).one('click', () => menu.remove());
    }

	_onItemMouseDown(event) {
		if (this.drawingLine) return; 
		if (event.button !== 0) return; // Only left click

		const itemElement = $(event.currentTarget);
		const itemId = itemElement.data('itemId');
		const itemData = this.currentBoardData.items[itemId];
		if (!itemData) return;

		const isGM = game.user.isGM;
		if (!isGM && itemData.isHiddenFromPlayer) return; 

		// Simplified permission checks for movement
		let canMove = false;
		if (isGM) {
			canMove = true;
		} else {
			// Players can move items if preventPlayerMove is false and item is not locked
			canMove = !this.currentBoardData.config.preventPlayerMove && !itemData.isLocked;
		}
		
		if (event.ctrlKey || event.metaKey) { // CTRL/CMD click for selection toggle
			this._toggleItemSelected(itemId); // This will handle both local highlight and global colored circle
			event.stopPropagation(); // Prevent drag start if only toggling selection
            if (!canMove) return; // If only toggling and cannot move, stop here
		} else {
            // Standard click (not CTRL/CMD)
            if (!this.selectedItemIds.has(itemId)) {
                // Clicked on an unselected item, so clear other selections and select this one.
                this._clearAllSelections(); // Clears local highlights and current user's colored circles
                this._toggleItemSelected(itemId, true); // Force select this item (local highlight and global circle)
            }
            // Now, the clicked item (itemId) is definitely in selectedItemIds (local highlight set).
            // If other items were also selected, they remain selected for multi-drag.
        }
		
		if (!canMove) return; // If cannot move, after selection logic, stop.
		this._startDrag(event, itemElement);
	}

    _startDrag(event, primaryItemElement) {
        this.isMultiDragging = true;
        this.draggingItem = primaryItemElement; // Primary item for offset calculations
        const primaryItemId = primaryItemElement.data('itemId');

        const boardCanvas = this.element.find('.clue-board-canvas');
        const boardRect = boardCanvas[0].getBoundingClientRect();

        // Calculate offset for the primary dragged item
        this.dragOffset = {
            x: event.clientX - primaryItemElement.offset().left,
            y: event.clientY - primaryItemElement.offset().top
        };
        
        this.multiDragInitialPositions.clear();
        for (const selId of this.selectedItemIds) {
            const selItemData = this.currentBoardData.items[selId];
            const selItemElement = this.element.find(`.clue-item[data-item-id="${selId}"]`);
            if (selItemData && selItemElement.length) {
                // Store initial data positions (top-left for rects, center for nodes)
                this.multiDragInitialPositions.set(selId, {
                    x: selItemData.x, 
                    y: selItemData.y,
                    // Store initial visual position for calculating delta consistently
                    initialLeft: parseInt(selItemElement.css('left'), 10),
                    initialTop: parseInt(selItemElement.css('top'), 10)
                });
                selItemElement.addClass('dragging');
            }
        }

        // Attach global listeners for dragging
        $(document).on(`mousemove.clueboardglobal-${this.boardId}`, this._onBoardCanvasMouseMove.bind(this));
        $(document).on(`mouseup.clueboardglobal-${this.boardId}`, this._onBoardCanvasMouseUp.bind(this));
    }
	
    _onDragMouseMove(event) {
        if (!this.draggingItem && !this.isMultiDragging) return;
        event.preventDefault();
        
        const boardCanvas = this.element.find('.clue-board-canvas');
        const boardRect = boardCanvas[0].getBoundingClientRect();
        const primaryItemId = this.draggingItem.data('itemId');
        const primaryItemInitialPos = this.multiDragInitialPositions.get(primaryItemId);
        if (!primaryItemInitialPos) return;

        const globalScale = this.currentBoardData.config.globalItemScale || 1.0;

        // Calculate the new visual top-left for the primary item based on mouse and dragOffset
        let primaryNewVisualX = event.clientX - boardRect.left - this.dragOffset.x;
        let primaryNewVisualY = event.clientY - boardRect.top - this.dragOffset.y;
        
        // Convert to unscaled coordinates for the primary item (data position for top-left)
        const primaryItemData = this.currentBoardData.items[primaryItemId];
        if (!primaryItemData) return; // Should not happen
        const primaryItemDims = this._getItemDimensions(primaryItemData);

        let primaryNewUnscaledX, primaryNewUnscaledY;
        if (primaryItemData.type === 'node') {
             primaryNewUnscaledX = primaryNewVisualX + (primaryItemDims.width/2) * (1-globalScale) - primaryItemDims.width/2;
             primaryNewUnscaledY = primaryNewVisualY + (primaryItemDims.height/2) * (1-globalScale) - primaryItemDims.height/2;

        } else {
             primaryNewUnscaledX = primaryNewVisualX - (primaryItemDims.width / 2) * (1 - globalScale);
             primaryNewUnscaledY = primaryNewVisualY - (primaryItemDims.height / 2) * (1 - globalScale);
        }
        
        // Calculate delta from primary item's initial visual position
        const dx = primaryNewUnscaledX - primaryItemInitialPos.initialLeft;
        const dy = primaryNewUnscaledY - primaryItemInitialPos.initialTop;

        const draggedItemsUpdate = []; // For socket broadcast

        // Move all selected items by this delta
        for (const itemId of this.selectedItemIds) {
            const itemEl = this.element.find(`.clue-item[data-item-id="${itemId}"]`);
            const itemData = this.currentBoardData.items[itemId];
            const initialPos = this.multiDragInitialPositions.get(itemId);

            if (itemEl.length && itemData && initialPos) {
                const itemDimensions = this._getItemDimensions(itemData);
                
                let newX = initialPos.initialLeft + dx; // This is the new CSS left
                let newY = initialPos.initialTop + dy; // This is the new CSS top

                // Bounds checking for each item (visual CSS positions)
                if (itemData.type === 'node') {
                    const nodeVisualRadiusX = (itemDimensions.width / 2) * globalScale; 
                    const nodeVisualRadiusY = (itemDimensions.height / 2) * globalScale;
                
                    let visualNodeCenterX = newX + itemDimensions.width / 2; // Center of the unscaled node at newX, newY
                    let visualNodeCenterY = newY + itemDimensions.height / 2;
                
                    const canvasWidth = this.currentBoardData.config.width;
                    const canvasHeight = this.currentBoardData.config.height;
                
                    // Adjust newX, newY based on visual boundaries
                    if (visualNodeCenterX - nodeVisualRadiusX < 0) newX = nodeVisualRadiusX - itemDimensions.width / 2;
                    if (visualNodeCenterX + nodeVisualRadiusX > canvasWidth) newX = canvasWidth - nodeVisualRadiusX - itemDimensions.width / 2;
                
                    if (visualNodeCenterY - nodeVisualRadiusY < 0) newY = nodeVisualRadiusY - itemDimensions.height / 2;
                    if (visualNodeCenterY + nodeVisualRadiusY > canvasHeight) newY = canvasHeight - nodeVisualRadiusY - itemDimensions.height / 2;

                } else {
                    const scaledWidth = itemDimensions.width * globalScale;
                    const scaledHeight = itemDimensions.height * globalScale;

                    // Visual top-left considers the scaling effect
                    const visualTopLeftX = newX - (scaledWidth - itemDimensions.width) / 2;
                    const visualTopLeftY = newY - (scaledHeight - itemDimensions.height) / 2;
                    
                    if (visualTopLeftX < 0) newX = (scaledWidth - itemDimensions.width) / 2;
                    if (visualTopLeftX + scaledWidth > this.currentBoardData.config.width) newX = this.currentBoardData.config.width - scaledWidth + (scaledWidth - itemDimensions.width) / 2;
                    
                    if (visualTopLeftY < 0) newY = (scaledHeight - itemDimensions.height) / 2;
                    if (visualTopLeftY + scaledHeight > this.currentBoardData.config.height) newY = this.currentBoardData.config.height - scaledHeight + (scaledHeight - itemDimensions.height) / 2;
                }
                
                itemEl.css({ left: newX + 'px', top: newY + 'px' });
                draggedItemsUpdate.push({ itemId: itemId, left: newX, top: newY });
                this._updateConnectionsForItem(itemId); 
            }
        }
        this._renderUserSelectionCircles(); 

        // Throttle socket emissions
        const now = Date.now();
        if (draggedItemsUpdate.length > 0 && (now - this.lastDragUpdateTime > this.dragUpdateThrottleMs)) {
            socketController.broadcastItemDragUpdate(this.boardId, draggedItemsUpdate);
            this.lastDragUpdateTime = now;
        }
    }

    async _onDragMouseUp(event) {
        if (!this.isMultiDragging && !this.draggingItem) return;

        // Send one final update before saving, to ensure others see the exact end position visually
        // This uses the same logic as _onDragMouseMove to calculate final visual positions
        const finalVisualUpdates = [];
        const boardCanvas = this.element.find('.clue-board-canvas');
        const boardRect = boardCanvas[0].getBoundingClientRect();
        const primaryItemId = this.draggingItem.data('itemId');
        const primaryItemInitialPos = this.multiDragInitialPositions.get(primaryItemId);
        
        if (primaryItemInitialPos) {
            const globalScale = this.currentBoardData.config.globalItemScale || 1.0;
            let primaryNewVisualX = event.clientX - boardRect.left - this.dragOffset.x;
            let primaryNewVisualY = event.clientY - boardRect.top - this.dragOffset.y;
            const primaryItemData = this.currentBoardData.items[primaryItemId];
            const primaryItemDims = this._getItemDimensions(primaryItemData);
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

            for (const itemId of this.selectedItemIds) {
                 const itemEl = this.element.find(`.clue-item[data-item-id="${itemId}"]`);
                 const itemData = this.currentBoardData.items[itemId];
                 const initialPos = this.multiDragInitialPositions.get(itemId);
                 if (itemEl.length && itemData && initialPos) {
                    const itemDimensions = this._getItemDimensions(itemData);
                    let newX = initialPos.initialLeft + dx;
                    let newY = initialPos.initialTop + dy;

                    // Re-apply bounds checking for the final position
                    if (itemData.type === 'node') {
                        const nodeVisualRadiusX = (itemDimensions.width / 2) * globalScale;
                        const nodeVisualRadiusY = (itemDimensions.height / 2) * globalScale;
                        let visualNodeCenterX = newX + itemDimensions.width / 2;
                        let visualNodeCenterY = newY + itemDimensions.height / 2;
                        const canvasWidth = this.currentBoardData.config.width;
                        const canvasHeight = this.currentBoardData.config.height;
                        if (visualNodeCenterX - nodeVisualRadiusX < 0) newX = nodeVisualRadiusX - itemDimensions.width / 2;
                        if (visualNodeCenterX + nodeVisualRadiusX > canvasWidth) newX = canvasWidth - nodeVisualRadiusX - itemDimensions.width / 2;
                        if (visualNodeCenterY - nodeVisualRadiusY < 0) newY = nodeVisualRadiusY - itemDimensions.height / 2;
                        if (visualNodeCenterY + nodeVisualRadiusY > canvasHeight) newY = canvasHeight - nodeVisualRadiusY - itemDimensions.height / 2;
                    } else {
                        const scaledWidth = itemDimensions.width * globalScale;
                        const scaledHeight = itemDimensions.height * globalScale;
                        const visualTopLeftX = newX - (scaledWidth - itemDimensions.width) / 2;
                        const visualTopLeftY = newY - (scaledHeight - itemDimensions.height) / 2;
                        if (visualTopLeftX < 0) newX = (scaledWidth - itemDimensions.width) / 2;
                        if (visualTopLeftX + scaledWidth > this.currentBoardData.config.width) newX = this.currentBoardData.config.width - scaledWidth + (scaledWidth - itemDimensions.width) / 2;
                        if (visualTopLeftY < 0) newY = (scaledHeight - itemDimensions.height) / 2;
                        if (visualTopLeftY + scaledHeight > this.currentBoardData.config.height) newY = this.currentBoardData.config.height - scaledHeight + (scaledHeight - itemDimensions.height) / 2;
                    }
                    // Update element's CSS for final local positioning before save
                    itemEl.css({ left: newX + 'px', top: newY + 'px' });
                    finalVisualUpdates.push({ itemId: itemId, left: newX, top: newY });
                 }
            }
            if (finalVisualUpdates.length > 0) {
                socketController.broadcastItemDragUpdate(this.boardId, finalVisualUpdates);
            }
        }


        const finalPositionsForSave = new Map(); 

        for (const itemId of this.selectedItemIds) {
            const itemElement = this.element.find(`.clue-item[data-item-id="${itemId}"]`);
            const itemData = this.currentBoardData.items[itemId];

            if (itemElement.length && itemData) {
                itemElement.removeClass('dragging');
                // Get the final CSS positions that were just set
                let finalCssX = parseInt(itemElement.css('left'), 10);
                let finalCssY = parseInt(itemElement.css('top'), 10);
                
                // Convert CSS positions (visual top-left) to data positions (x, y)
                let posToSave = { x: finalCssX, y: finalCssY };
                if (itemData.type === 'node') {
                    // For nodes, data x,y is center. CSS left,top is top-left of bounding box.
                    const itemDimensions = this._getItemDimensions(itemData);
                    posToSave.x = finalCssX + itemDimensions.width / 2; 
                    posToSave.y = finalCssY + itemDimensions.height / 2;
                }
                // For other items, data x,y is already top-left, matching CSS.
                finalPositionsForSave.set(itemId, posToSave);
            }
        }
        
        // Remove global listeners
        $(document).off(`mousemove.clueboardglobal-${this.boardId}`);
        $(document).off(`mouseup.clueboardglobal-${this.boardId}`);
        
        this.draggingItem = null;
        this.isMultiDragging = false;
        this.multiDragInitialPositions.clear();
        this.lastDragUpdateTime = 0; // Reset throttle timer
        
        // Persist the final positions.
        if (finalPositionsForSave.size > 0) {
            // Update local data representation for immediate consistency before the server replies.
            // This prevents a visual snap if the server response is slow.
            for (const [itemId, pos] of finalPositionsForSave) {
                if (this.currentBoardData.items[itemId]) {
                    this.currentBoardData.items[itemId].x = pos.x;
                    this.currentBoardData.items[itemId].y = pos.y;
                }
            }

            if (game.user.isGM) {
                // GM saves each item directly. This will broadcast the final state.
                for (const [itemId, pos] of finalPositionsForSave) {
                    await ClueBoardData.updateItem(this.boardId, itemId, { x: pos.x, y: pos.y });
                }
            } else {
                // Player sends a single request to the GM to save all new positions.
                const updates = Array.from(finalPositionsForSave, ([itemId, pos]) => ({ itemId, pos }));
                socketController.requestItemPositionUpdates(this.boardId, updates);
            }
        }
    }
    
    _onItemContextMenu(event) {
        if (this.drawingLine) {
            this._endLineDrawing();
            event.preventDefault();
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const itemElement = $(event.currentTarget);
        const itemId = itemElement.data('itemId');
        const itemData = this.currentBoardData.items[itemId];
        if (!itemData) return;

        if (!game.user.isGM && itemData.isHiddenFromPlayer) return;

        // If right-clicking an unselected item, clear other selections and select this one
        if (!this.selectedItemIds.has(itemId)) {
            this._clearAllSelections();
            this._toggleItemSelected(itemId, true); // Force select (local highlight + global circle)
        }
        // If right-clicking a selected item, keep current selection

        this.element.find('.item-context-menu-icons').not(itemElement.find('.item-context-menu-icons')).hide();
        const iconsContainer = itemElement.find('.item-context-menu-icons');
        if (!iconsContainer.length) return;

        if (iconsContainer.is(':visible')) {
            iconsContainer.hide();
            return;
        }

        iconsContainer.empty();
        const isGM = game.user.isGM;
        const isCreator = itemData.creatorUserId === game.user.id;

        iconsContainer.append(
            $(`<a title="${game.i18n.localize('LGS_CB2.ContextMenu.DrawConnection')}"><i class="fas fa-project-diagram"></i></a>`)
            .on('click', (e) => { e.stopPropagation(); iconsContainer.hide(); this._onDrawLineStart(itemId); })
        );

        const playerCanManageNotesOrNodes = !isGM && isCreator && (itemData.type === 'note' || itemData.type === 'node');
        const playerCanManageOwnImage = !isGM && isCreator && (itemData.isCustomImage || itemData.isPlaceholder) && !this.currentBoardData.config.preventPlayerMove && !itemData.isLocked;


        if (itemData.type === 'note' || itemData.type === 'node') {
            if (isGM || playerCanManageNotesOrNodes) {
                iconsContainer.append(
                    $(`<a title="${itemData.isLocked ? game.i18n.localize('LGS_CB2.ContextMenu.UnlockItem') : game.i18n.localize('LGS_CB2.ContextMenu.LockItem')}"><i class="fas ${itemData.isLocked ? 'fa-lock' : 'fa-lock-open'}"></i></a>`)
                    .on('click', (e) => { e.stopPropagation(); iconsContainer.hide(); this._onToggleItemLock(itemId); })
                );
            }
        } else if (itemData.type === 'actor' || itemData.isCustomImage || itemData.isPlaceholder) {
            if (isGM) { 
                iconsContainer.append(
                    $(`<a title="${itemData.isLocked ? game.i18n.localize('LGS_CB2.ContextMenu.UnlockItem') : game.i18n.localize('LGS_CB2.ContextMenu.LockItem')}"><i class="fas ${itemData.isLocked ? 'fa-lock' : 'fa-lock-open'}"></i></a>`)
                    .on('click', (e) => { e.stopPropagation(); iconsContainer.hide(); this._onToggleItemLock(itemId); })
                );
            } else if (playerCanManageOwnImage) { // Players can lock/unlock their own images if board allows
                 iconsContainer.append(
                    $(`<a title="${itemData.isLocked ? game.i18n.localize('LGS_CB2.ContextMenu.UnlockItem') : game.i18n.localize('LGS_CB2.ContextMenu.LockItem')}"><i class="fas ${itemData.isLocked ? 'fa-lock' : 'fa-lock-open'}"></i></a>`)
                    .on('click', (e) => { e.stopPropagation(); iconsContainer.hide(); this._onToggleItemLock(itemId); })
                );
            }
        }
        
        if (itemData.type === 'note' || itemData.type === 'actor' || itemData.type === 'node' || itemData.isCustomImage || itemData.isPlaceholder) {
            let showCogIcon = false;
            if (isGM) {
                showCogIcon = true;
            } else { 
                if (itemData.type === 'note' && isCreator) {
                    showCogIcon = true;
                } else if (itemData.type === 'actor' || itemData.isCustomImage || itemData.isPlaceholder) { 
                    showCogIcon = true; 
                }
            }

            if (showCogIcon) {
                iconsContainer.append(
                    $(`<a title="${game.i18n.localize('LGS_CB2.ContextMenu.ConfigureItem')}"><i class="fas fa-cog"></i></a>`)
                    .on('click', (e) => { e.stopPropagation(); iconsContainer.hide(); this._onConfigureItem(itemId); })
                );
            }
        }

        if (itemData.type === 'note' || itemData.type === 'node') {
            if (isGM || playerCanManageNotesOrNodes) {
                iconsContainer.append(
                    $(`<a title="${game.i18n.localize('LGS_CB2.ContextMenu.DeleteItem')}"><i class="fas fa-trash"></i></a>`)
                    .on('click', (e) => { e.stopPropagation(); iconsContainer.hide(); this._onDeleteItem(itemId); })
                );
            }
        } else if (itemData.type === 'actor' || itemData.isCustomImage || itemData.isPlaceholder) { 
            if (isGM) { 
                iconsContainer.append(
                    $(`<a title="${game.i18n.localize('LGS_CB2.ContextMenu.DeleteItem')}"><i class="fas fa-trash"></i></a>`)
                    .on('click', (e) => { e.stopPropagation(); iconsContainer.hide(); this._onDeleteItem(itemId); })
                );
            } else if (playerCanManageOwnImage) {
                 iconsContainer.append(
                    $(`<a title="${game.i18n.localize('LGS_CB2.ContextMenu.DeleteItem')}"><i class="fas fa-trash"></i></a>`)
                    .on('click', (e) => { e.stopPropagation(); iconsContainer.hide(); this._onDeleteItem(itemId); })
                );
            }
        }

        if (itemData.type === 'actor' || itemData.isCustomImage || itemData.isPlaceholder) {
            let showEyeIcon = false;
            if (isGM) {
                showEyeIcon = true;
            } else { 
                if (!itemData.isBlurred) { 
                    showEyeIcon = true;
                }
            }
            if (showEyeIcon) {
                iconsContainer.append(
                    $(`<a title="${game.i18n.localize('LGS_CB2.ContextMenu.ViewImage')}"><i class="fas fa-eye"></i></a>`)
                    .on('click', (e) => {
                        e.stopPropagation();
                        iconsContainer.hide();
                        this._onViewImage(itemId);
                    })
                );
            }
        }
        iconsContainer.show();
    }

     _onViewImage(itemId) {
        const itemData = this.currentBoardData.items[itemId];
        if (!itemData || !(itemData.type === 'actor' || itemData.isCustomImage || itemData.isPlaceholder)) return;
        const itemIsBlurredOnBoardForPlayer = !game.user.isGM && itemData.isBlurred;
        new RevealImageDialog(itemData.img, itemIsBlurredOnBoardForPlayer).render(true);
    }

    _onDrawLineStart(fromItemId) {
        this._clearAllSelections(); // Clear selections when starting to draw a line
        this.element.find('.item-context-menu-icons').hide();
        this.drawingLine = true;
        this.lineFromItemId = fromItemId;
        this.element.find('.clue-board-canvas').addClass('drawing-line');
        const svg = this.element.find('.connections-svg');
        const fromCenter = this._getItemCenter(this.currentBoardData.items[fromItemId]);
        
        if (fromCenter) {
            this.tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            this.tempLine.setAttribute('x1', fromCenter.x);
            this.tempLine.setAttribute('y1', fromCenter.y);
            this.tempLine.setAttribute('x2', fromCenter.x); 
            this.tempLine.setAttribute('y2', fromCenter.y);
            this.tempLine.setAttribute('stroke', 'red');
            this.tempLine.setAttribute('stroke-width', '3'); 
            this.tempLine.setAttribute('stroke-dasharray', '5,5');
            this.tempLine.classList.add('temp-line');
            svg.append(this.tempLine);
            ui.notifications.info(game.i18n.localize('LGS_CB2.Notifications.DrawConnectionHelp'));
        } else {
            this._endLineDrawing();
        }
    }

    _endLineDrawing() {
        if (this.element && this.element.length) { 
            this.element.find('.clue-board-canvas').removeClass('drawing-line');
        }
        if (this.tempLine) {
            this.tempLine.remove();
            this.tempLine = null;
        }
        this.drawingLine = false;
        this.lineFromItemId = null;
    }

   async _createConnection(fromItemId, toItemId) {
        if (!this.currentBoardData || !Array.isArray(this.currentBoardData.connections)) {
            ui.notifications.error("Board data error: Connections array missing.");
            throw new Error("Connections array missing");
        }
        if (!fromItemId || !this.currentBoardData.items[fromItemId] || !toItemId || !this.currentBoardData.items[toItemId]) {
            ui.notifications.error("Invalid item ID for connection.");
            throw new Error("Invalid item ID");
        }
        const existingConnection = this.currentBoardData.connections.find(conn => 
            (conn.fromItemId === fromItemId && conn.toItemId === toItemId) ||
            (conn.fromItemId === toItemId && conn.toItemId === fromItemId)
        );
        if (existingConnection) {
            ui.notifications.warn(game.i18n.localize('LGS_CB2.Notifications.ConnectionExists'));
            return;
        }

        if (game.user.isGM) {
            try {
                await ClueBoardData.addConnection(this.boardId, fromItemId, toItemId);
                this.currentBoardData = ClueBoardData.getBoardData(this.boardId); // Refresh data locally for immediate feedback
                this._renderConnections(); // Re-render connections
                ui.notifications.info(game.i18n.localize('LGS_CB2.Notifications.ConnectionCreated'));
            } catch (err) {
                // console.error(`${MODULE_ID} | Failed to add connection:`, err);
                ui.notifications.error("Failed to save connection.");
                throw err;
            }
        } else {
            // Player performs an optimistic update and sends a request to the GM
            const tempConnection = { id: foundry.utils.randomID(), fromItemId, toItemId, creatorUserId: game.user.id };
            this.currentBoardData.connections.push(tempConnection);
            this._renderConnections(); // Draw the line immediately for the player
            
            socketController.requestAddConnection(this.boardId, fromItemId, toItemId);
            ui.notifications.info(game.i18n.localize('LGS_CB2.Notifications.ConnectionCreated'));
        }
    }

    _updateConnectionsForItem(draggedItemId) {
        const svg = this.element.find('.connections-svg');
        if (!this.currentBoardData || !this.currentBoardData.connections) return;
        
        const draggedItemElement = this.element.find(`.clue-item[data-item-id="${draggedItemId}"]`);
        if (!draggedItemElement.length) return;

        const isGM = game.user.isGM;

        this.currentBoardData.connections.forEach(conn => {
            if (conn.fromItemId === draggedItemId || conn.toItemId === draggedItemId) {
                const line = svg.find(`line[data-conn-id="${conn.id}"]`);
                if (line.length) {
                    const fromItemData = this.currentBoardData.items[conn.fromItemId];
                    const toItemData = this.currentBoardData.items[conn.toItemId];

                    if (!fromItemData || !toItemData) return;
                    if (!isGM && (fromItemData.isHiddenFromPlayer || toItemData.isHiddenFromPlayer)) {
                        line.hide(); 
                        return;
                    }
                    line.show();

                    let fromCenter, toCenter;
                    // Use current visual position of elements for line rendering during drag
                    const fromItemEl = this.element.find(`.clue-item[data-item-id="${conn.fromItemId}"]`);
                    const toItemEl = this.element.find(`.clue-item[data-item-id="${conn.toItemId}"]`);

                    if (fromItemEl.length) fromCenter = this._getItemCenter(fromItemEl);
                    else fromCenter = this._getItemCenter(fromItemData); // Fallback if element not found (should not happen)

                    if (toItemEl.length) toCenter = this._getItemCenter(toItemEl);
                    else toCenter = this._getItemCenter(toItemData); // Fallback

                    if (fromCenter && toCenter) {
                        line.attr('x1', fromCenter.x);
                        line.attr('y1', fromCenter.y);
                        line.attr('x2', toCenter.x);
                        line.attr('y2', toCenter.y);
                    }
                }
            }
        });
    }


    _renderConnections() {
        const svg = this.element.find('.connections-svg');
        svg.empty(); 
        if (!this.currentBoardData || !this.currentBoardData.connections) return;
        const isGM = game.user.isGM;

        this.currentBoardData.connections.forEach(conn => {
            const fromItemData = this.currentBoardData.items[conn.fromItemId];
            const toItemData = this.currentBoardData.items[conn.toItemId];

            if (fromItemData && toItemData) {
                if (!isGM && (fromItemData.isHiddenFromPlayer || toItemData.isHiddenFromPlayer)) {
                    return; 
                }

                const fromCenter = this._getItemCenter(fromItemData); 
                const toCenter = this._getItemCenter(toItemData);   
                const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                lineEl.setAttribute('x1', fromCenter.x);
                lineEl.setAttribute('y1', fromCenter.y);
                lineEl.setAttribute('x2', toCenter.x);
                lineEl.setAttribute('y2', toCenter.y);
                lineEl.setAttribute('stroke', 'black'); 
                lineEl.setAttribute('stroke-width', '2');
                lineEl.setAttribute('data-conn-id', conn.id);
                if (game.users.get(conn.creatorUserId)?.isGM) {
                    lineEl.classList.add('gm-line');
                }
                svg.append(lineEl);
            }
        });
    }

    _renderUserSelectionCircles() {
        if (!this.element || !this.currentBoardData || !this.currentBoardData.items || !this.currentBoardData.config) return;
        const boardCanvas = this.element.find('.clue-board-canvas');
        let circlesLayer = this.element.find('.user-selection-circles-layer');
        if (!circlesLayer.length) { 
            circlesLayer = $('<div class="user-selection-circles-layer" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 3;"></div>');
            boardCanvas.append(circlesLayer);
        }
        circlesLayer.empty();

        const globalScale = this.currentBoardData.config.globalItemScale || 1.0;
        const circleDiameter = 10;
        const circleSpacing = 2; 
        const circleOffsetAboveItem = 12; 

        for (const itemId in this.currentBoardData.itemSelections) {
            const userIds = this.currentBoardData.itemSelections[itemId];
            if (!userIds || userIds.length === 0) continue;

            const itemData = this.currentBoardData.items[itemId];
            if (!itemData) continue;

            const itemElement = this.element.find(`.clue-item[data-item-id="${itemId}"]`);
            if (!itemElement.length) continue;

            const itemDims = this._getItemDimensions(itemData);
            
            const cssLeft = parseFloat(itemElement.css('left'));
            const cssTop = parseFloat(itemElement.css('top'));

            let itemVisualX_topLeft, itemVisualY_topLeft;
            const itemVisualWidth = itemDims.width * globalScale;
            const itemVisualHeight = itemDims.height * globalScale;

            if (itemData.type === 'node') {
                itemVisualX_topLeft = cssLeft - (itemVisualWidth - itemDims.width) / 2;
                itemVisualY_topLeft = cssTop - (itemVisualHeight - itemDims.height) / 2;
            } else {
                itemVisualX_topLeft = cssLeft - (itemVisualWidth - itemDims.width) / 2;
                itemVisualY_topLeft = cssTop - (itemVisualHeight - itemDims.height) / 2;
            }
            
            const filteredUserIds = userIds.filter(uid => uid !== game.user.id); 
            if (filteredUserIds.length === 0) continue; 

            const totalCirclesWidth = (filteredUserIds.length * circleDiameter) + ((filteredUserIds.length - 1) * circleSpacing);
            let startCircleX = itemVisualX_topLeft + (itemVisualWidth / 2) - (totalCirclesWidth / 2);
            const circleY = itemVisualY_topLeft - circleOffsetAboveItem;

            filteredUserIds.forEach((userId, index) => {
                const user = game.users.get(userId);
                if (!user) return;

                const circleWrapper = $('<div></div>') // Wrapper for circle and tooltip
                    .addClass('user-selection-circle') // Apply existing circle styles
                    .css({
                        // Circle specific styles are in CSS, position here
                        'left': `${startCircleX + index * (circleDiameter + circleSpacing)}px`,
                        'top': `${circleY}px`,
                        'background-color': user.color,
                        'pointer-events': 'auto' // Make the wrapper hoverable
                    });

                const tooltip = $('<span></span>')
                    .addClass('user-selection-circle-tooltip')
                    .text(user.name);
                
                circleWrapper.append(tooltip);
                circlesLayer.append(circleWrapper);
            });
        }
    }


async _render(force = false, options = {}) {
        if (!this.boardId) return; 
        const oldSelectedIds = new Set(this.selectedItemIds); 

        if (!this.currentBoardData && this.boardId) {
            this.currentBoardData = ClueBoardData.getBoardData(this.boardId);
        }
        if (!this.currentBoardData) {
            // Attempt to fetch again if it was undefined, in case of timing issues
            const freshBoardData = ClueBoardData.getBoardData(this.boardId);
            if (freshBoardData) {
                this.currentBoardData = freshBoardData;
            } else {
                ui.notifications.error(`Clue Board with ID ${this.boardId} not found during render.`);
                if (this.rendered) await this.close({force: true}); 
                return; 
            }
        }
        
        // Ensure config and itemSelections objects and their typical properties exist
        this.currentBoardData.config = this.currentBoardData.config || {};
        if (typeof this.currentBoardData.config.globalItemScale === 'undefined') {
            this.currentBoardData.config.globalItemScale = 1.0;
        }
        if (typeof this.currentBoardData.config.imageFrameType === 'undefined') {
            this.currentBoardData.config.imageFrameType = "photo";
        }
        if (typeof this.currentBoardData.config.width === 'undefined') {
            this.currentBoardData.config.width = 1000;
        }
        if (typeof this.currentBoardData.config.height === 'undefined') {
            this.currentBoardData.config.height = 1000;
        }
        if (typeof this.currentBoardData.itemSelections === 'undefined') { 
            this.currentBoardData.itemSelections = {};
        }

        // --- New logic to clean up stale server-side selections for the current user ---
        // This ensures that if the server thinks the current user has an item selected
        // (via itemSelections, for the colored circle), but the user's local state
        // (selectedItemIds, for the green highlight) doesn't reflect that,
        // the server is told to remove that stale selection for the current user.
        if (this.currentBoardData && this.currentBoardData.itemSelections) {
            const itemsToCleanForCurrentUser = [];
            for (const itemId in this.currentBoardData.itemSelections) {
                if (this.currentBoardData.items && this.currentBoardData.items[itemId] && // Ensure item exists
                    Array.isArray(this.currentBoardData.itemSelections[itemId]) &&
                    this.currentBoardData.itemSelections[itemId].includes(game.user.id)) {
                    
                    // Server thinks current user selected this item.
                    // If local selection state (selectedItemIds) doesn't have it, it's stale on server.
                    if (!this.selectedItemIds.has(itemId)) {
                        itemsToCleanForCurrentUser.push(itemId);
                    }
                }
            }

            if (itemsToCleanForCurrentUser.length > 0) {
                // Perform these updates. They are fire-and-forget in terms of awaiting
                // within this render pass, as they will trigger socket broadcasts
                // which will lead to a new render cycle with fresh data.
                itemsToCleanForCurrentUser.forEach(itemId => {
                    ClueBoardData.removeUserSelectionFromItem(this.boardId, itemId, game.user.id)
                        .catch(err => console.error(`${MODULE_ID} | Error auto-cleaning stale selection for item ${itemId}:`, err));
                });
                // Note: this.currentBoardData for *this specific render pass* might be slightly out of date
                // regarding itemSelections if the above calls complete and broadcast very quickly.
                // However, the socket-triggered re-render will use completely fresh data.
            }
        }
        // --- End of new logic ---

        this.options.width = this.currentBoardData.config.width + 40;
        this.options.height = this.currentBoardData.config.height + 70;
        
        await super._render(force, options); 
        
        if (this.rendered) {
            this._renderConnections(); 
            this._renderUserSelectionCircles(); // Draws colored circles for OTHER users' selections
            if (this._nodeCountersVisible) { 
                this.showNodeCounters(true, this._highlightedNodeForCounter);
            }
            this.selectedItemIds = oldSelectedIds; // Restore current user's local selections (green highlights)
            this._updateAllSelectedItemsVisuals(); // Apply green highlights based on restored local selections
        }
    }
	
    async close(options = {}) { 
        this._endLineDrawing(); 
        if (this.marqueeRectDiv) {
            this.marqueeRectDiv.remove();
            this.marqueeRectDiv = null;
        }
        $(document).off(`.clueboard-${this.boardId}`);
        $(document).off(`.clueboardglobal-${this.boardId}`); 
        $(document).off(`.clueboard-hidecontext-${this.boardId}`);
        if (this._nodeCountersVisible) {
            this.showNodeCounters(false); 
        }
        
        if (this.currentBoardData && this.currentBoardData.itemSelections) {
            for (const itemId in this.currentBoardData.itemSelections) {
                if (this.currentBoardData.itemSelections[itemId].includes(game.user.id)) {
                    ClueBoardData.removeUserSelectionFromItem(this.boardId, itemId, game.user.id);
                }
            }
        }
        this._clearAllSelections(false); 
        return super.close(options);
    }

    _onAddNoteContext(x, y, isHidden = false) { 
        if (!this.currentBoardData) {
            ui.notifications.error("Cannot add note: Board data not loaded.");
            return;
        }
        this._clearAllSelections();
        const itemWidth = DEFAULT_NOTE_WIDTH;
        const itemHeight = DEFAULT_NOTE_HEIGHT;
        const topLeftX = x - itemWidth / 2;
        const topLeftY = y - itemHeight / 2;
        new AddNoteDialog(this.boardId, { x: topLeftX, y: topLeftY, isHiddenFromPlayer: isHidden }).render(true);
    }

    _onAddClueContext(x, y) { 
        this._clearAllSelections();
        new AddClueDialog(this.boardId, {x, y}, this).render(true);
    }

    _onConfigButtonClick(event) {
        event.preventDefault();
        this._clearAllSelections();
        new ClueBoardConfigDialog(this.boardId, this).render(true);
    }

    _getNextNodeCounter() {
        const nodeItems = Object.values(this.currentBoardData.items).filter(item => item.type === 'node');
        const existingCounters = nodeItems
            .map(item => item.circleCounter)
            .filter(counter => typeof counter === 'number' && !isNaN(counter))
            .sort((a, b) => a - b);

        if (existingCounters.length === 0) return 1;
        for (let i = 0; i < existingCounters.length; i++) {
            if (existingCounters[i] !== i + 1) {
                return i + 1; 
            }
        }
        return existingCounters[existingCounters.length - 1] + 1;
    }

	async _onDrop(event) {
        this._clearAllSelections();
		try {
			const rawData = event.dataTransfer.getData('text/plain');
            if (!rawData) return;
			const data = JSON.parse(rawData);

            if (data.boardId && data.boardId !== this.boardId) {
                return;
            }

            const boardCanvas = this.element.find('.clue-board-canvas');
			const rect = boardCanvas[0].getBoundingClientRect();
			let dropX = event.clientX - rect.left;
			let dropY = event.clientY - rect.top;

            let newItemData = null;
            let itemWidth, itemHeight, topLeftX, topLeftY;
            let canPlayerAdd = false; 
            const isGM = game.user.isGM;
            const hideItemFromPlayer = isGM ? (data.hideAddedItemFromPlayer || false) : false;


            const countImageLikeItems = () => {
                let currentCount = 0;
                if (this.currentBoardData && this.currentBoardData.items) {
                    currentCount = Object.values(this.currentBoardData.items).filter(it =>
                        it.type === 'actor' || it.isCustomImage || it.isPlaceholder
                    ).length;
                }
                return currentCount + 1;
            };

			if (data.type === "Actor") { 
                if (!isGM) {
                    ui.notifications.warn("Only GMs can drag Actors directly to the board.");
                    return;
                }
				const actor = game.actors.get(data.uuid.split('.').pop());
				if (actor) {
                    itemWidth = DEFAULT_ACTOR_ITEM_WIDTH;
					itemHeight = DEFAULT_ACTOR_ITEM_HEIGHT;
                    topLeftX = dropX - itemWidth / 2;
					topLeftY = dropY - itemHeight / 2;
                    let initialIsBlurred = this.currentBoardData.config.blurPlacedImages;
                    if (event.ctrlKey) initialIsBlurred = true;
					newItemData = {
						type: 'actor', actorId: actor.id, img: actor.img || CONST.DEFAULT_TOKEN,
						frameImg: `modules/${MODULE_ID}/assets/photoFrame.webp`, 
						x: topLeftX, y: topLeftY, width: itemWidth, height: itemHeight,
						actorImageScale: 1, actorImageOffsetX: 0, actorImageOffsetY: 0,
						isLocked: false, isBlurred: initialIsBlurred,
						isDead: false, isCaptured: false, gmNotes: "", playerNotes: "",
						clueName: actor.name, isHiddenFromPlayer: hideItemFromPlayer,
                        lockClueName: false, 
                        isCustomImage: false, isPlaceholder: false,
                        imageFrameType: 'board_default' 
					};
				}
			} else if (data.type === "CluePaletteItem") {
                if (data.clueType === 'actor') { 
                    if (!isGM) {
                         ui.notifications.warn("Only GMs can add actors from the palette.");
                         return;
                    }
                    const actor = game.actors.get(data.actorId);
                    if (actor) {
                        itemWidth = DEFAULT_ACTOR_ITEM_WIDTH;
					    itemHeight = DEFAULT_ACTOR_ITEM_HEIGHT;
					    topLeftX = dropX - itemWidth / 2;
					    topLeftY = dropY - itemHeight / 2;
                        let initialIsBlurred = this.currentBoardData.config.blurPlacedImages;
                        if (event.ctrlKey) initialIsBlurred = true;
                        
                        let clueName;
                        if (data.useActorName) {
                            clueName = actor.name;
                        } else {
                            const newClueNumber = countImageLikeItems();
                            clueName = game.i18n.format("LGS_CB2.DefaultPlaceholderClueNameNumbered", { number: newClueNumber });
                        }

                        newItemData = {
                            type: 'actor', actorId: actor.id, img: actor.img || CONST.DEFAULT_TOKEN,
                            frameImg: `modules/${MODULE_ID}/assets/photoFrame.webp`,
                            x: topLeftX, y: topLeftY, width: itemWidth, height: itemHeight,
                            actorImageScale: 1, actorImageOffsetX: 0, actorImageOffsetY: 0,
                            isLocked: false, isBlurred: initialIsBlurred,
                            isDead: false, isCaptured: false, gmNotes: "", playerNotes: "",
						    clueName: clueName, isHiddenFromPlayer: hideItemFromPlayer,
                            lockClueName: false,
                            isCustomImage: false, isPlaceholder: false,
                            imageFrameType: 'board_default' 
                        };
                    }
                } else if (data.clueType === 'node') {
                    if (!isGM) {
                         ui.notifications.warn("Only GMs can add connection nodes.");
                         return;
                    }
                    const counter = this._getNextNodeCounter();
                    itemWidth = DEFAULT_NODE_WIDTH;
                    itemHeight = DEFAULT_NODE_HEIGHT;
                    newItemData = {
                        type: 'node', x: dropX, y: dropY, // Store center for node
                        width: itemWidth, height: itemHeight, isHiddenFromPlayer: false, 
                        isLocked: false, circleCounter: counter, clueName: `Node ${counter}`
                    };
                } else if (data.clueType === 'image-selector') { 
                    if (!isGM) {
                         ui.notifications.warn("Only GMs can add custom images this way.");
                         return;
                    }
                } else if (data.clueType === 'placeholder-actor-image') {
                    canPlayerAdd = true;
                    itemWidth = DEFAULT_ACTOR_ITEM_WIDTH;
                    itemHeight = DEFAULT_ACTOR_ITEM_HEIGHT;
                    topLeftX = dropX - itemWidth / 2;
                    topLeftY = dropY - itemHeight / 2;
                    let initialIsBlurred = this.currentBoardData.config.blurPlacedImages;
                    if (event.ctrlKey && isGM) initialIsBlurred = true;

                    const newClueNumber = countImageLikeItems();
                    const defaultClueName = game.i18n.format("LGS_CB2.DefaultPlaceholderClueNameNumbered", { number: newClueNumber });

                    newItemData = {
                        type: 'actor', actorId: null, isCustomImage: false, isPlaceholder: true,
                        img: PLACEHOLDER_IMAGE_PATH,
                        frameImg: `modules/${MODULE_ID}/assets/photoFrame.webp`,
                        x: topLeftX, y: topLeftY, width: itemWidth, height: itemHeight,
                        actorImageScale: 1, actorImageOffsetX: 0, actorImageOffsetY: 0,
                        isLocked: false, isBlurred: initialIsBlurred, 
                        isHiddenFromPlayer: hideItemFromPlayer && isGM, 
                        isDead: false, isCaptured: false, gmNotes: "", playerNotes: "",
                        clueName: defaultClueName, 
                        lockClueName: false,
                        imageFrameType: 'board_default' 
                    };
                }
            }

			if (newItemData) {
                if (!newItemData.creatorUserId) {
                    newItemData.creatorUserId = game.user.id;
                }
                 if (typeof newItemData.isHiddenFromPlayer === 'undefined') { 
                    newItemData.isHiddenFromPlayer = false;
                }

                if (newItemData.type === 'actor' || newItemData.isCustomImage || newItemData.isPlaceholder) {
                    let resolvedItemFrameType = newItemData.imageFrameType;
                    if (resolvedItemFrameType === 'board_default') {
                        resolvedItemFrameType = this.currentBoardData.config?.imageFrameType || 'photo';
                    }
                    if (resolvedItemFrameType === 'circle') {
                        if (newItemData.width !== newItemData.height) {
                            const size = Math.max(newItemData.width, newItemData.height);
                            newItemData.width = size;
                            newItemData.height = size;
                        }
                    }
                }


                const boardConfig = this.currentBoardData.config;
                if (newItemData.type === 'node') {
                    newItemData.x = Math.max(itemWidth / 2, Math.min(newItemData.x, boardConfig.width - itemWidth / 2));
                    newItemData.y = Math.max(itemHeight / 2, Math.min(newItemData.y, boardConfig.height - itemHeight / 2));
                } else {
                    newItemData.x = Math.max(0, Math.min(newItemData.x, boardConfig.width - newItemData.width));
                    newItemData.y = Math.max(0, Math.min(newItemData.y, boardConfig.height - newItemData.height));
                }

                if (isGM) {
                    const updatedBoard = await ClueBoardData.addItem(this.boardId, newItemData);
                    if (updatedBoard) {
                        this.currentBoardData = updatedBoard;
                        this.render(false);
                    }
                } else if (canPlayerAdd) { 
                    const newId = foundry.utils.randomID();
                    newItemData.id = newId;

                    // Optimistic update for the player for immediate feedback
                    if (this.currentBoardData.items) {
                        this.currentBoardData.items[newId] = newItemData;
                        this.render(false);
                    }

                    socketController.requestAddItemToServer(this.boardId, newItemData);
                } else {
                    ui.notifications.warn("You do not have permission to add this type of item.");
                }
			}
		} catch (err) {
            const rawData = event?.dataTransfer?.getData('text/plain'); 
            if (err instanceof SyntaxError && rawData && !rawData.startsWith('{')) { 
            } else {
			    // console.warn(`${MODULE_ID} | Drop error:`, err, "Raw data:", rawData);
            }
		}
	}

    async _onToggleItemLock(itemId) { // Only operates on the specified item, not the whole selection
        const item = this.currentBoardData.items[itemId];
        if (!item) return;
        const isGM = game.user.isGM;
        const isCreator = item.creatorUserId === game.user.id;

        let canToggle = false;
        if (isGM) {
            canToggle = true;
        } else {
            if ( (item.type === 'note' || item.type === 'node') && isCreator ) {
                canToggle = true;
            } else if ( (item.isCustomImage || item.isPlaceholder) && isCreator && !this.currentBoardData.config.preventPlayerMove ) {
                canToggle = true;
            }
        }

        if (!canToggle) {
            ui.notifications.warn(game.i18n.localize("LGS_CB2.Notifications.CannotToggleLock"));
            return;
        }
        await ClueBoardData.updateItem(this.boardId, itemId, { isLocked: !item.isLocked });
    }


    _onConfigureItem(itemId) { // Operates on primary clicked item, not whole selection
        const itemData = this.currentBoardData.items[itemId];
        if (!itemData) {
            ui.notifications.error(`Item ${itemId} not found for configuration.`);
            return;
        }
        this._clearAllSelections(); 
        const isGM = game.user.isGM;
        const isCreator = itemData.creatorUserId === game.user.id;

        if (itemData.type === 'note') {
            if (isGM || isCreator) {
                new AddNoteDialog(this.boardId, itemId).render(true, { focus: true });
            } else {
                 ui.notifications.warn(game.i18n.localize("LGS_CB2.Notifications.CannotConfigureItem"));
            }
        } else if (itemData.type === 'actor' || itemData.isCustomImage || itemData.isPlaceholder) {
            if (isGM) { 
                 new ClueItemConfigDialog(this.boardId, itemId, this).render(true, { focus: true });
            } else if (!itemData.lockClueName) { 
                 new ClueItemConfigDialog(this.boardId, itemId, this, { playerEditMode: true }).render(true, { focus: true });
            } else { 
                 ui.notifications.warn(game.i18n.localize("LGS_CB2.Notifications.ItemNameLocked"));
            }
        } else if (itemData.type === 'node') {
            if (isGM) { 
                new ClueNodeConfigDialog(this.boardId, itemId, this).render(true, { focus: true });
            } else {
                 ui.notifications.warn(game.i18n.localize("LGS_CB2.Notifications.CannotConfigureItem"));
            }
        } else {
            ui.notifications.warn(game.i18n.format("LGS_CB2.Notifications.NoConfigForItemType", {type: itemData.type}));
        }
    }

	async _onDeleteItem(itemId) { 
		const item = this.currentBoardData.items[itemId];
		if (!item) return;
		const isGM = game.user.isGM;
		const isCreator = item.creatorUserId === game.user.id;

		let canDelete = false;
		if (isGM) {
			canDelete = true;
		} else { 
			if ( (item.type === 'note' || item.type === 'node') && isCreator ) {
				if (!item.isLocked) canDelete = true;
			} else if ( (item.isCustomImage || item.isPlaceholder) && isCreator ) {
				if (!this.currentBoardData.config.preventPlayerMove && !item.isLocked) {
					canDelete = true;
				}
			}
		}

		if (!canDelete) {
			ui.notifications.warn(game.i18n.localize("LGS_CB2.Notifications.CannotDeleteItem"));
			return;
		}

		const confirmed = await Dialog.confirm({
			title: game.i18n.format("LGS_CB2.Confirmations.DeleteItemTitle", { type: item.clueName || item.type || 'Item' }),
			content: `<p>${game.i18n.format("LGS_CB2.Confirmations.DeleteItemContent", { type: item.clueName || item.type || 'item' })}</p>`
		});

		if (confirmed) {
            // Perform an optimistic update for a smoother UX
            if (this.selectedItemIds.has(itemId)) {
                this._toggleItemSelected(itemId, false); 
            }
            if (this.currentBoardData.items[itemId]) {
                delete this.currentBoardData.items[itemId];
            }
            if (this.currentBoardData.connections) {
                this.currentBoardData.connections = this.currentBoardData.connections.filter(conn => 
                    conn.fromItemId !== itemId && conn.toItemId !== itemId
                );
            }
            if (this.currentBoardData.itemSelections && this.currentBoardData.itemSelections[itemId]) {
                delete this.currentBoardData.itemSelections[itemId];
            }
            this.render(false);

            // --- MODIFICATION START ---
            // If GM, delete directly. If Player, send request to GM.
            if (isGM) {
                try {
                    await ClueBoardData.deleteItem(this.boardId, itemId); 
                } catch (error) {
                    ui.notifications.error(`Failed to delete item ${itemId}.`);
                    // If the deletion fails, refresh the board from the source of truth
                    this.currentBoardData = ClueBoardData.getBoardData(this.boardId);
                    this.render(false);
                }
            } else {
                // Player sends a request to the GM to delete the item
                socketController.requestDeleteItem(this.boardId, itemId);
            }
            // --- MODIFICATION END ---
		}
	}
 
    showNodeCounters(visible, highlightedNodeId = null) {
        this._nodeCountersVisible = visible;
        this._highlightedNodeForCounter = highlightedNodeId;

        if (!this.element || !this.currentBoardData || !this.currentBoardData.items) return;

        this.element.find('.clue-item.node-item').each((idx, el) => {
            const itemElement = $(el);
            const itemId = itemElement.data('itemId');
            const itemData = this.currentBoardData.items[itemId];
            
            itemElement.find('.node-counter-display').remove(); 

            if (visible && itemData && typeof itemData.circleCounter === 'number') {
                if (!game.user.isGM && itemData.isHiddenFromPlayer) return;

                const counterDisplay = $(`<div class="node-counter-display">${itemData.circleCounter}</div>`);
                if (itemId === highlightedNodeId) {
                    counterDisplay.addClass('highlighted');
                }
                itemElement.append(counterDisplay);
            }
        });
    }
	
    updateAppearance(configChanges) {
        if (!this.rendered) return;
        const boardCanvas = this.element.find('.clue-board-canvas');
        let needsReRender = false;

        if (configChanges.width !== undefined) {
            boardCanvas.css('width', configChanges.width + 'px');
            this.position.width = configChanges.width + 8;
        }
        if (configChanges.height !== undefined) {
            boardCanvas.css('height', configChanges.height + 'px');
            this.position.height = configChanges.height + 38;
        }
        if (configChanges.backgroundImage !== undefined) {
            boardCanvas.css('background-image', `url('${configChanges.backgroundImage}')`);
        }
        if (configChanges.backgroundScaleX !== undefined || configChanges.backgroundScaleY !== undefined) {
            const scaleX = configChanges.backgroundScaleX ?? this.currentBoardData.config.backgroundScaleX;
            const scaleY = configChanges.backgroundScaleY ?? this.currentBoardData.config.backgroundScaleY;
            boardCanvas.css('background-size', `${scaleX}px ${scaleY}px`);
        }
        if (configChanges.globalItemScale !== undefined) {
            this.currentBoardData.config.globalItemScale = parseFloat(configChanges.globalItemScale);
            needsReRender = true; 
        }
        if (configChanges.imageFrameType !== undefined) {
            this.currentBoardData.config.imageFrameType = configChanges.imageFrameType;
            needsReRender = true;
        }
        
        this.setPosition({width: this.position.width, height: this.position.height});
        if (configChanges.preventPlayerMove !== undefined) this.currentBoardData.config.preventPlayerMove = configChanges.preventPlayerMove;
        if (configChanges.blurPlacedImages !== undefined) this.currentBoardData.config.blurPlacedImages = configChanges.blurPlacedImages;
        
        if (needsReRender) {
            this.render(false); 
        } else {
            this._renderUserSelectionCircles(); 
        }
    }

	async previewItemUpdate(itemId, updatedItemData) {
		if (!this.currentBoardData || !this.currentBoardData.items || !this.currentBoardData.items[itemId]) {
			return;
		}

		if (this._previewingItemId !== itemId || !this._originalPreviewItemData) {
			this._previewingItemId = itemId;
			const actualBoardData = ClueBoardData.getBoardData(this.boardId);
			if (actualBoardData && actualBoardData.items && actualBoardData.items[itemId]) {
				 this._originalPreviewItemData = foundry.utils.deepClone(actualBoardData.items[itemId]);
			} else {
				this._originalPreviewItemData = foundry.utils.deepClone(this.currentBoardData.items[itemId]);
			}
		}

		const itemToRender = foundry.utils.mergeObject(
			foundry.utils.deepClone(this._originalPreviewItemData), 
			updatedItemData, 
			{ inplace: false, insertKeys: true, insertValues: true, overwrite: true, recursive: true }
		);
        
        if (itemToRender.type === 'actor' || itemToRender.isCustomImage || itemToRender.isPlaceholder) {
            let effectiveFrameType = itemToRender.imageFrameType;
            if (effectiveFrameType === 'board_default') {
                 const boardDialogInstance = Object.values(ui.windows).find(app => app.id === `${MODULE_ID}-board-${this.boardId}`);
                 const boardConfig = boardDialogInstance ? boardDialogInstance.currentBoardData.config : this.currentBoardData.config;
                 effectiveFrameType = boardConfig?.imageFrameType || 'photo';
            }
            if (effectiveFrameType === 'circle') {
                if (itemToRender.width !== itemToRender.height) {
                    const size = Math.max(itemToRender.width, itemToRender.height);
                    itemToRender.width = size;
                    itemToRender.height = size;
                }
            }
        }
		
		this.currentBoardData.items[itemId] = itemToRender;

		if (this.rendered) {
			await this.render(false);
		}
	}
	
    clearItemPreview(itemId, maintainCurrentStateAfterSave = false) {
        if (this._previewingItemId === itemId && this.currentBoardData.items[itemId]) {
            if (maintainCurrentStateAfterSave) {
                this._originalPreviewItemData = foundry.utils.deepClone(this.currentBoardData.items[itemId]);
            } else if (this._originalPreviewItemData) {
                this.currentBoardData.items[itemId] = foundry.utils.deepClone(this._originalPreviewItemData);
            }
        }
    
        if (this._previewingItemId === itemId) {
            this._previewingItemId = null;
            this._originalPreviewItemData = null; 
        }
    }

    // --- Marquee Selection and Multi-Select/Drag Methods ---

    _startMarqueeSelection(event) {
        if (event.button !== 0 || $(event.target).closest('.clue-item').length > 0) {
            return;
        }
        
        if (!event.ctrlKey && !event.metaKey) {
            this._clearAllSelections();
        }

        this.isMarqueeSelecting = true;
        const boardCanvas = this.element.find('.clue-board-canvas'); 
        const rect = boardCanvas[0].getBoundingClientRect();
        this.marqueeStartPos = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };

        let recreateMarquee = false;
        if (!this.marqueeRectDiv) { 
            recreateMarquee = true;
        } else {
            if (!boardCanvas[0].contains(this.marqueeRectDiv[0])) {
                this.marqueeRectDiv.remove(); 
                recreateMarquee = true;
            }
        }

        if (recreateMarquee) {
            this.marqueeRectDiv = $('<div class="marquee-select-rect"></div>');
            boardCanvas.append(this.marqueeRectDiv);
        }

        this.marqueeRectDiv.css({
            left: this.marqueeStartPos.x + 'px',
            top: this.marqueeStartPos.y + 'px',
            width: '0px',
            height: '0px'
        }).show();

        $(document).on(`mousemove.clueboardglobal-${this.boardId}`, this._onBoardCanvasMouseMove.bind(this));
        $(document).on(`mouseup.clueboardglobal-${this.boardId}`, this._onBoardCanvasMouseUp.bind(this));
        event.stopPropagation();
    }

	_updateMarqueeSelection(event) {
		if (!this.isMarqueeSelecting || !this.marqueeRectDiv) return;

		const boardCanvas = this.element.find('.clue-board-canvas');
		const rect = boardCanvas[0].getBoundingClientRect();
		const currentMouseX = event.clientX - rect.left;
		const currentMouseY = event.clientY - rect.top;

		const marqueeX = Math.min(this.marqueeStartPos.x, currentMouseX);
		const marqueeY = Math.min(this.marqueeStartPos.y, currentMouseY);
		const marqueeWidth = Math.abs(currentMouseX - this.marqueeStartPos.x);
		const marqueeHeight = Math.abs(currentMouseY - this.marqueeStartPos.y);

		this.marqueeRectDiv.css({
			left: marqueeX + 'px',
			top: marqueeY + 'px',
			width: marqueeWidth + 'px',
			height: marqueeHeight + 'px'
		});

		const marqueeRect = { x: marqueeX, y: marqueeY, width: marqueeWidth, height: marqueeHeight };
		const itemsInMarquee = new Set();
		
		boardCanvas.find('.clue-item').each((idx, el) => {
			const itemElement = $(el);
			const itemId = itemElement.data('itemId');
			const itemData = this.currentBoardData.items[itemId];
			
			if (!game.user.isGM && itemData && itemData.isHiddenFromPlayer) {
				return;
			}
			
			if (this._isItemIntersectingMarquee(itemElement, marqueeRect)) {
				itemsInMarquee.add(itemId);
				if (!this.selectedItemIds.has(itemId)) { 
					this._toggleItemSelected(itemId, true); 
				}
			}
		});

		if (!event.ctrlKey && !event.metaKey) {
			const itemsToDeselect = [];
			for (const selectedId of this.selectedItemIds) { 
				if (!itemsInMarquee.has(selectedId)) {
					itemsToDeselect.push(selectedId);
				}
			}
			itemsToDeselect.forEach(itemId => {
				this._toggleItemSelected(itemId, false); 
			});
		}
	}

	_endMarqueeSelection(event) {
		if (!this.isMarqueeSelecting) return;
		
		this.isMarqueeSelecting = false;
		this.justFinishedMarquee = true; 
		
		if (this.marqueeRectDiv) {
			this.marqueeRectDiv.hide(); 
		}
		
		$(document).off(`mousemove.clueboardglobal-${this.boardId}`);
		$(document).off(`mouseup.clueboardglobal-${this.boardId}`);
	}


	_isItemIntersectingMarquee(itemElement, marqueeRect) {
		const itemId = itemElement.data('itemId');
		const itemData = this.currentBoardData.items[itemId];
		if (!itemData) return false;

		const baseDimensions = this._getItemDimensions(itemData);
		const globalScale = this.currentBoardData.config.globalItemScale || 1.0;
		
		const scaledWidth = baseDimensions.width * globalScale;
		const scaledHeight = baseDimensions.height * globalScale;
		
		const itemLeft = parseInt(itemElement.css('left'), 10);
		const itemTop = parseInt(itemElement.css('top'), 10);
		
		const sizeDiffWidth = scaledWidth - baseDimensions.width;
		const sizeDiffHeight = scaledHeight - baseDimensions.height;
		
		const visualLeft = itemLeft - (sizeDiffWidth / 2);
		const visualTop = itemTop - (sizeDiffHeight / 2);
		
		const itemRect = {
			x: visualLeft,
			y: visualTop,
			width: scaledWidth,
			height: scaledHeight
		};

		return !(itemRect.x + itemRect.width < marqueeRect.x ||
				 itemRect.x > marqueeRect.x + marqueeRect.width ||
				 itemRect.y + itemRect.height < marqueeRect.y ||
				 itemRect.y > marqueeRect.y + marqueeRect.height);
	}

    _toggleItemSelected(itemId, forceState = null) {
        let isSelectedLocally; 
        if (forceState !== null) {
            if (forceState) this.selectedItemIds.add(itemId);
            else this.selectedItemIds.delete(itemId);
            isSelectedLocally = forceState;
        } else {
            if (this.selectedItemIds.has(itemId)) {
                this.selectedItemIds.delete(itemId);
                isSelectedLocally = false;
            } else {
                this.selectedItemIds.add(itemId);
                isSelectedLocally = true;
            }
        }
        this._applyItemHighlight(itemId, isSelectedLocally); 

        if (isSelectedLocally) {
            ClueBoardData.addUserSelectionToItem(this.boardId, itemId, game.user.id);
        } else {
            ClueBoardData.removeUserSelectionFromItem(this.boardId, itemId, game.user.id);
        }
    }

    _clearAllSelections(notifyServer = true) {
        this.selectedItemIds.forEach(id => {
            this._applyItemHighlight(id, false); 
            if (notifyServer) {
                ClueBoardData.removeUserSelectionFromItem(this.boardId, id, game.user.id); 
            }
        });
        this.selectedItemIds.clear();
    }

    _applyItemHighlight(itemId, isHighlighted) {
        const itemElement = this.element.find(`.clue-item[data-item-id="${itemId}"]`);
        if (itemElement.length) {
            if (isHighlighted) {
                itemElement.addClass('item-selected-highlight');
            } else {
                itemElement.removeClass('item-selected-highlight');
            }
        }
    }
    _updateAllSelectedItemsVisuals() { // For local green highlights
        this.element.find('.clue-item').each((idx, el) => {
            const $el = $(el);
            const id = $el.data('itemId');
            if (this.selectedItemIds.has(id)) {
                $el.addClass('item-selected-highlight');
            } else {
                $el.removeClass('item-selected-highlight');
            }
        });
    }
    
    // New method to handle remote drag updates
    _handleRemoteItemDragUpdate(itemsData) {
        if (!this.rendered || !this.element) return;

        itemsData.forEach(itemUpdate => {
            const itemElement = this.element.find(`.clue-item[data-item-id="${itemUpdate.itemId}"]`);
            if (itemElement.length) {
                itemElement.css({
                    left: itemUpdate.left + 'px',
                    top: itemUpdate.top + 'px'
                });
                this._updateConnectionsForItem(itemUpdate.itemId);
            }
        });
        this._renderUserSelectionCircles(); // Update selection circles as items move
    }

} 
Handlebars.registerHelper('renderClueItem', function(item, boardConfig) {
    if (!game.user.isGM && item.isHiddenFromPlayer) {
        return ''; 
    }

    let itemHtml = '';
    // MODIFICATION: The hasGMNotes check now includes gmNotes for actor/image/node items.
    const hasGMNotes = game.user.isGM && 
                       ((item.type === 'note' && item.gmText && item.gmText.trim() !== "") ||
                        ((item.type === 'actor' || item.isCustomImage || item.isPlaceholder) && item.gmNotes && item.gmNotes.trim() !== "") || 
                        (item.type === 'node' && item.gmNotes && item.gmNotes.trim() !== "")); 

    const configForThisItemRender = foundry.utils.deepClone(boardConfig || {});
    if (typeof configForThisItemRender.globalItemScale === 'undefined') {
        configForThisItemRender.globalItemScale = 1.0;
    }
    if (typeof configForThisItemRender.imageFrameType === 'undefined') {
        configForThisItemRender.imageFrameType = "photo";
    }

    let effectiveItemFrameType = configForThisItemRender.imageFrameType;
    if (item.type === 'actor' || item.isCustomImage || item.isPlaceholder) {
        if (item.imageFrameType && item.imageFrameType !== 'board_default') {
            effectiveItemFrameType = item.imageFrameType;
        }
    }
    configForThisItemRender.imageFrameType = effectiveItemFrameType;


    const commonData = { 
        item: item, 
        boardConfig: configForThisItemRender, 
        MODULE_ID: MODULE_ID, 
        NODE_RADIUS: NODE_RADIUS, 
        isGM: game.user.isGM,
        hasGMNotes: hasGMNotes,
        isGMHidden: game.user.isGM && item.isHiddenFromPlayer 
    }; 
    try {
        if (item.type === 'actor' || item.isCustomImage || item.isPlaceholder) { 
            if (Handlebars.partials[TEMPLATES.CLUE_ITEM]) {
                itemHtml = Handlebars.partials[TEMPLATES.CLUE_ITEM](commonData);
            } else {
                itemHtml = `<div class="clue-item error-item" style="z-index:2;">Error: Actor/Image Template Missing</div>`;
            }
        } else if (item.type === 'note') {
            if (Handlebars.partials[TEMPLATES.CLUE_NOTE_ITEM]) {
                itemHtml = Handlebars.partials[TEMPLATES.CLUE_NOTE_ITEM](commonData);
            } else {
                itemHtml = `<div class="clue-item error-item" style="z-index:2;">Error: Note Template Missing</div>`;
            }
        } else if (item.type === 'node') {
            const itemWidth = item.width || DEFAULT_NODE_WIDTH;
            const itemHeight = item.height || DEFAULT_NODE_HEIGHT;
            const nodeLeft = item.x - (itemWidth / 2); 
            const nodeTop = item.y - (itemHeight / 2); 
            const gmHiddenClass = (commonData.isGMHidden) ? 'gm-hidden-item' : '';

            const nodeTemplateString = `
                <div class="clue-item node-item {{#if item.isLocked}}locked{{/if}} ${gmHiddenClass}" 
                     data-item-id="{{item.id}}"
                     data-circle-counter="{{item.circleCounter}}" 
                     style="left: ${nodeLeft}px; top: ${nodeTop}px; 
                            width: ${itemWidth}px; height: ${itemHeight}px; 
                            background-color: white; border: 2px solid black; border-radius: 50%; 
                            position:absolute; z-index: 2;
                            display: flex; align-items: center; justify-content: center; 
                            transform: scale({{boardConfig.globalItemScale}}); transform-origin: center center;">
                    <div class="item-context-menu-icons" style="position: absolute; left: -30px; top: 0px; display: none; flex-direction: column; gap: 5px; z-index: 10;"></div>
                 </div>`;
            const compiledNodeTemplate = Handlebars.compile(nodeTemplateString);
            itemHtml = compiledNodeTemplate(commonData); 
        }
    } catch (e) {
        itemHtml = `<div class="clue-item error-item" data-item-id="${item.id}" style="left: ${item.x||0}px; top: ${item.y||0}px; width:100px; height:50px; border:2px solid red; background:pink;">Error rendering item ${item.id}</div>`;
    }
    return new Handlebars.SafeString(itemHtml);
});

if (!Handlebars.helpers.subtract) {
    Handlebars.registerHelper('subtract', (a, b) => Number(a) - Number(b));
}
if (!Handlebars.helpers.multiply) {
    Handlebars.registerHelper('multiply', (a, b) => {
        const numA = Number(a);
        const numB = Number(b);
        if (isNaN(numA) || isNaN(numB)) return ''; 
        return Math.round(numA * numB); 
    });
}