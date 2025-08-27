// scripts/SocketController.js
import { MODULE_ID, SOCKET_EVENT } from './constants.js';
import { ClueBoardData } from './ClueBoardData.js'; // Added for GM-side item addition

class SocketController {
    constructor() {
        this.socket = null;
    }

    initialize() {
        this.socket = game.socket;
        this.socket.on(SOCKET_EVENT, this._onSocketMessage.bind(this));
        // console.log(`${MODULE_ID} | Socket initialized`);
    }

     async _onSocketMessage(payload) { // Made async to await ClueBoardData.addItem
        if (!payload.action) return;

        // console.log(`${MODULE_ID} | Socket: Received message (sender: ${payload.senderId}, self: ${game.user.id}):`, payload);

        switch (payload.action) {
            case 'boardDataUpdate':
                this._handleBoardDataUpdate(payload.data);
                break;
            case 'requestAddItem': // New action for player item additions
                if (game.user.isGM) { // Only GMs should process this request
                    const { boardId, itemData } = payload.data;
                    try {
                        // Add the item, which saves and broadcasts to OTHER clients
                        const updatedBoardData = await ClueBoardData.addItem(boardId, itemData);

                        // Explicitly update the GM's own view if the board is open.
                        // This avoids relying on the socket round-trip for the GM.
                        if (updatedBoardData) {
                            const clueBoardApp = Object.values(ui.windows).find(
                                app => app.constructor.name === 'ClueBoardDialog' && app.boardId === boardId && app.rendered
                            );
                            if (clueBoardApp) {
                                clueBoardApp.currentBoardData = updatedBoardData;
                                clueBoardApp.render(false);
                            }
                        }
                    } catch (error) {
                        console.error(`${MODULE_ID} | GM Error processing requestAddItem:`, error);
                        ui.notifications.error(`Failed to add item for user ${payload.senderId}.`);
                    }
                }
                break;
            case 'requestAddConnection': // New action for player connections
                if (game.user.isGM) {
                    const { boardId, fromItemId, toItemId } = payload.data;
                    await ClueBoardData.addConnection(boardId, fromItemId, toItemId);
                    // The addConnection call will save and broadcast the update to all clients.
                }
                break;
            case 'itemDragUpdate': // New action for real-time dragging
                if (payload.senderId !== game.user.id) { // Don't process own drag updates
                    this._handleItemDragUpdate(payload.data);
                }
                break;
            case 'requestItemPositionUpdates': // New action for saving positions after drag
                if (game.user.isGM) {
                    const { boardId, updates } = payload.data;
                    // The GM receives the request and updates each item.
                    // This will trigger board data updates to all clients.
                    for (const update of updates) { // update is {itemId, pos}
                        await ClueBoardData.updateItem(boardId, update.itemId, update.pos);
                    }
                }
                break;
            case 'requestItemUpdate': // New action for generic item updates (e.g., notes)
                if (game.user.isGM) {
                    const { boardId, itemId, updates } = payload.data;
                    await ClueBoardData.updateItem(boardId, itemId, updates);
                }
                break;
        }
    }

    _handleBoardDataUpdate({ boardId, boardData, allBoardsData }) {
        // console.log(`${MODULE_ID} | Socket: Handling boardDataUpdate. boardId: ${boardId}, has boardData: ${!!boardData}, allBoardsData: ${!!allBoardsData}`);
        
        if (allBoardsData) {
            Object.values(ui.windows).forEach(app => {
                if (app.constructor.name === 'ClueBoardManagerDialog') {
                    app.render(true);
                }
            });
        }
        else if (boardId && boardData) {
            Object.values(ui.windows).forEach(app => {
                if (app.constructor.name === 'ClueBoardDialog' && app.boardId === boardId) {
                    app.currentBoardData = boardData; 
                    app.render(true);
                }
                if (app.constructor.name === 'ClueBoardManagerDialog') {
                    // Manager might need to update if a board's name/hidden status changed.
                    app.render(true);
                }
            });
        }
    }

    _handleItemDragUpdate({ boardId, items }) {
        // console.log(`${MODULE_ID} | Socket: Handling itemDragUpdate for board ${boardId}`, items);
        Object.values(ui.windows).forEach(app => {
            if (app.constructor.name === 'ClueBoardDialog' && app.boardId === boardId && app.rendered) {
                app._handleRemoteItemDragUpdate(items);
            }
        });
    }

    broadcastBoardDataUpdate(boardId, data) {
        // console.log(`${MODULE_ID} | Socket: Broadcasting update. boardId: ${boardId}`);
        const payload = {
            action: 'boardDataUpdate',
            senderId: game.user.id,
            data: boardId ? { boardId, boardData: data } : { allBoardsData: data },
            timestamp: Date.now()
        };
        this.socket.emit(SOCKET_EVENT, payload);
    }
	
	requestAddConnection(boardId, fromItemId, toItemId) {
        if (!game.user.isGM) {
            const payload = {
                action: 'requestAddConnection',
                senderId: game.user.id,
                data: { boardId, fromItemId, toItemId },
                timestamp: Date.now()
            };
            this.socket.emit(SOCKET_EVENT, payload);
        }
    }


    // New method for players to request an item be added
    requestAddItemToServer(boardId, itemData) {
        if (!game.user.isGM) { // Players send request
            // console.log(`${MODULE_ID} | Player requesting item add:`, { boardId, itemData });
            const payload = {
                action: 'requestAddItem',
                senderId: game.user.id,
                data: { boardId, itemData },
                timestamp: Date.now()
            };
            this.socket.emit(SOCKET_EVENT, payload);
        } else {
            // GM can add directly (though _onDrop handles this already)
            console.warn(`${MODULE_ID} | GM called requestAddItemToServer. This should ideally be handled directly.`);
            ClueBoardData.addItem(boardId, itemData);
        }
    }

    // New method to broadcast item drag updates
    broadcastItemDragUpdate(boardId, itemsUpdateData) {
        // console.log(`${MODULE_ID} | Socket: Broadcasting itemDragUpdate for board ${boardId}`, itemsUpdateData);
        const payload = {
            action: 'itemDragUpdate',
            senderId: game.user.id,
            data: { boardId, items: itemsUpdateData },
            timestamp: Date.now()
        };
        this.socket.emit(SOCKET_EVENT, payload);
    }

    // New method for players to request final positions be saved
    requestItemPositionUpdates(boardId, updates) {
        if (!game.user.isGM) {
            const payload = {
                action: 'requestItemPositionUpdates',
                senderId: game.user.id,
                data: { boardId, updates }, // updates is an array of {itemId, pos:{x,y}}
                timestamp: Date.now()
            };
            this.socket.emit(SOCKET_EVENT, payload);
        }
    }

    // New method for players to request generic item updates
    requestItemUpdate(boardId, itemId, updates) {
        if (!game.user.isGM) {
            const payload = {
                action: 'requestItemUpdate',
                senderId: game.user.id,
                data: { boardId, itemId, updates },
                timestamp: Date.now()
            };
            this.socket.emit(SOCKET_EVENT, payload);
        }
    }
}

export const socketController = new SocketController();