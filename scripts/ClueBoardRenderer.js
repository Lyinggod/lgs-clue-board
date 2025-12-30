// scripts/ClueBoardRenderer.js
import { MODULE_ID, DEFAULT_ACTOR_ITEM_WIDTH, DEFAULT_ACTOR_ITEM_HEIGHT, DEFAULT_NOTE_WIDTH, DEFAULT_NOTE_HEIGHT, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from './constants.js';

export class ClueBoardRenderer {
    constructor(dialog) {
        this.dialog = dialog;
    }

    /**
     * Renders all custom elements on the board, like connections and selection circles.
     * Called after the main application render.
     */
    renderCustomElements() {
        if (!this.dialog.rendered) return;
        this._renderConnections();
        this._renderUserSelectionCircles();
    }

    /**
     * Calculates the width and height of an item, accounting for its type and frame shape.
     * @param {object} item The item data object.
     * @returns {{width: number, height: number}}
     */
    getItemDimensions(item) {
        if (!item) return { width: 0, height: 0 };
        let width, height;
        const boardConfig = this.dialog.currentBoardData?.config;

        let effectiveFrameType = item.imageFrameType;
        if (item.imageFrameType === 'board_default' || typeof item.imageFrameType === 'undefined') {
            effectiveFrameType = boardConfig?.imageFrameType || "photo";
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

    /**
     * Calculates the center coordinates of an item.
     * @param {jQuery|object} itemElementOrData The item's jQuery element or data object.
     * @returns {{x: number, y: number}}
     */
    getItemCenter(itemElementOrData) {
        let itemData, currentX_topLeft, currentY_topLeft;
        const isElement = itemElementOrData instanceof jQuery;

        if (isElement) {
            const itemId = itemElementOrData.data('itemId');
            itemData = this.dialog.currentBoardData.items[itemId];
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
        
        const dimensions = this.getItemDimensions(itemData);
        return {
            x: currentX_topLeft + dimensions.width / 2,
            y: currentY_topLeft + dimensions.height / 2
        };
    }

    /**
     * Updates the SVG lines connected to a specific item, typically during a drag operation.
     * @param {string} draggedItemId The ID of the item being moved.
     */
    updateConnectionsForItem(draggedItemId) {
        const svg = this.dialog.element.find('.connections-svg');
        const boardData = this.dialog.currentBoardData;
        if (!boardData || !boardData.connections) return;
        
        const isGM = game.user.isGM;

        boardData.connections.forEach(conn => {
            if (conn.fromItemId === draggedItemId || conn.toItemId === draggedItemId) {
                const line = svg.find(`line[data-conn-id="${conn.id}"]`);
                if (line.length) {
                    const fromItemData = boardData.items[conn.fromItemId];
                    const toItemData = boardData.items[conn.toItemId];

                    if (!fromItemData || !toItemData) return;
                    if (!isGM && (fromItemData.isHiddenFromPlayer || toItemData.isHiddenFromPlayer)) {
                        line.hide(); 
                        return;
                    }
                    line.show();

                    const fromItemEl = this.dialog.element.find(`.clue-item[data-item-id="${conn.fromItemId}"]`);
                    const toItemEl = this.dialog.element.find(`.clue-item[data-item-id="${conn.toItemId}"]`);

                    const fromCenter = fromItemEl.length ? this.getItemCenter(fromItemEl) : this.getItemCenter(fromItemData);
                    const toCenter = toItemEl.length ? this.getItemCenter(toItemEl) : this.getItemCenter(toItemData);

                    if (fromCenter && toCenter) {
                        line.attr('x1', fromCenter.x).attr('y1', fromCenter.y);
                        line.attr('x2', toCenter.x).attr('y2', toCenter.y);
                    }
                }
            }
        });
    }

    /**
     * Renders all connection lines from scratch based on current board data.
     * @private
     */
    _renderConnections() {
        const svg = this.dialog.element.find('.connections-svg');
        svg.empty(); 
        const boardData = this.dialog.currentBoardData;
        if (!boardData || !boardData.connections) return;
        
        const isGM = game.user.isGM;

        boardData.connections.forEach(conn => {
            const fromItemData = boardData.items[conn.fromItemId];
            const toItemData = boardData.items[conn.toItemId];

            if (fromItemData && toItemData) {
                if (!isGM && (fromItemData.isHiddenFromPlayer || toItemData.isHiddenFromPlayer)) {
                    return; 
                }

                const fromCenter = this.getItemCenter(fromItemData); 
                const toCenter = this.getItemCenter(toItemData);   
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

    /**
     * Renders colored circles above items to indicate which other users have them selected.
     * @private
     */
    _renderUserSelectionCircles() {
        const boardData = this.dialog.currentBoardData;
        if (!this.dialog.element || !boardData || !boardData.items || !boardData.config) return;
        
        const boardCanvas = this.dialog.element.find('.clue-board-canvas');
        let circlesLayer = this.dialog.element.find('.user-selection-circles-layer');
        if (!circlesLayer.length) { 
            circlesLayer = $('<div class="user-selection-circles-layer" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 3;"></div>');
            boardCanvas.append(circlesLayer);
        }
        circlesLayer.empty();

        const globalScale = boardData.config.globalItemScale || 1.0;
        const circleDiameter = 10;
        const circleSpacing = 2; 
        const circleOffsetAboveItem = 12; 

        for (const itemId in boardData.itemSelections) {
            const userIds = boardData.itemSelections[itemId]?.filter(uid => uid !== game.user.id);
            if (!userIds || userIds.length === 0) continue;

            const itemData = boardData.items[itemId];
            const itemElement = this.dialog.element.find(`.clue-item[data-item-id="${itemId}"]`);
            if (!itemData || !itemElement.length) continue;

            const itemDims = this.getItemDimensions(itemData);
            const cssLeft = parseFloat(itemElement.css('left'));
            const cssTop = parseFloat(itemElement.css('top'));
            const itemVisualWidth = itemDims.width * globalScale;
            const itemVisualHeight = itemDims.height * globalScale;

            const itemVisualX_topLeft = cssLeft - (itemVisualWidth - itemDims.width) / 2;
            const itemVisualY_topLeft = cssTop - (itemVisualHeight - itemDims.height) / 2;
            
            const totalCirclesWidth = (userIds.length * circleDiameter) + ((userIds.length - 1) * circleSpacing);
            let startCircleX = itemVisualX_topLeft + (itemVisualWidth / 2) - (totalCirclesWidth / 2);
            const circleY = itemVisualY_topLeft - circleOffsetAboveItem;

            userIds.forEach((userId, index) => {
                const user = game.users.get(userId);
                if (!user) return;

                const circleWrapper = $('<div></div>')
                    .addClass('user-selection-circle')
                    .css({
                        'left': `${startCircleX + index * (circleDiameter + circleSpacing)}px`,
                        'top': `${circleY}px`,
                        'background-color': user.color,
                        'pointer-events': 'auto'
                    });

                const tooltip = $('<span></span>').addClass('user-selection-circle-tooltip').text(user.name);
                circleWrapper.append(tooltip).appendTo(circlesLayer);
            });
        }
    }
}