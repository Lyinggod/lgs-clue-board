import { MODULE_ID, FLAGS, DEFAULT_ACTOR_ITEM_WIDTH, DEFAULT_ACTOR_ITEM_HEIGHT, DEFAULT_NOTE_WIDTH, DEFAULT_NOTE_HEIGHT, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from './constants.js'; // Added more constants
//import { socketController } from './SocketController.js';

export class ClueBoardData {
    static get allBoardsData() {
        try {
            if (typeof game.world?.getFlag === 'function') {
                return game.world.getFlag(MODULE_ID, FLAGS.CLUEBOARDS) || {};
            } else {
                const data = game.settings.get(MODULE_ID, FLAGS.CLUEBOARDS);
                return data || {};
            }
        } catch (e) {
            console.error(`${MODULE_ID} | Error accessing Clue Board data:`, e);
            return {}; 
        }
    }

    static async saveAllBoardsData(data) {
		if(game.user.isGM){
			try {
				if (typeof game.world?.setFlag === 'function') {
					await game.world.setFlag(MODULE_ID, FLAGS.CLUEBOARDS, data);
				} else {
					await game.settings.set(MODULE_ID, FLAGS.CLUEBOARDS, data);
				}
			} catch (e) {
				console.error(`${MODULE_ID} | Error saving Clue Board data:`, e);
			}
		}
    }

    static getBoardData(boardId) {
        const allBoards = this.allBoardsData;
        return allBoards[boardId];
    }

    static async saveBoardData(boardId, boardData) {
        const { socketController } = await import('./SocketController.js');
        const allBoards = this.allBoardsData;
        allBoards[boardId] = boardData;
        await this.saveAllBoardsData(allBoards); 
        socketController.broadcastBoardDataUpdate(boardId, boardData);
    }

    static async addBoard(name) {
        const { socketController } = await import('./SocketController.js');
        const boardId = foundry.utils.randomID();
        const newBoard = {
            id: boardId, name: name, isHidden: false,
            config: {
                width: 1000, height: 1000, backgroundImage: "",
                backgroundScaleX: 1000, backgroundScaleY: 1000,
                lockBackgroundScaleProportion: true,
                globalItemScale: 1.0, 
                preventPlayerMove: false, blurPlacedImages: false,
                imageFrameType: "photo" 
            },
            items: {}, 
            connections: [],
            itemSelections: {} // Added for user selection circles
        };
        const allBoards = this.allBoardsData;
        allBoards[boardId] = newBoard;
        await this.saveAllBoardsData(allBoards);
        socketController.broadcastBoardDataUpdate(null, allBoards);
        return boardId;
    }
	
        static async deleteBoard(boardId) {
        const { socketController } = await import('./SocketController.js');
        const allBoards = this.allBoardsData;
        delete allBoards[boardId];
        await this.saveAllBoardsData(allBoards);
        socketController.broadcastBoardDataUpdate(null, allBoards);
    }

    static async updateBoardMetadata(boardId, { name, isHidden }) {
        const boardData = this.getBoardData(boardId);
        if (!boardData) return;
        if (name !== undefined) boardData.name = name;
        if (isHidden !== undefined) boardData.isHidden = isHidden;
        await this.saveBoardData(boardId, boardData); 
    }

    static async updateBoardConfig(boardId, configUpdates) {
        const boardData = this.getBoardData(boardId);
        if (!boardData) return;

        const oldConfig = foundry.utils.deepClone(boardData.config); // Clone old config for comparison
        boardData.config = { ...boardData.config, ...configUpdates };

        if (boardData.config.globalItemScale !== undefined) {
            boardData.config.globalItemScale = parseFloat(boardData.config.globalItemScale);
        }
        if (typeof boardData.config.imageFrameType === 'undefined') { 
            boardData.config.imageFrameType = "photo";
        }

        // If board's default imageFrameType changed, update relevant items
        if (configUpdates.imageFrameType !== undefined && configUpdates.imageFrameType !== oldConfig.imageFrameType) {
            for (const itemId in boardData.items) {
                const item = boardData.items[itemId];
                if ((item.type === 'actor' || item.isCustomImage || item.isPlaceholder) && item.imageFrameType === 'board_default') {
                    // Determine the new effective frame type for this item
                    const effectiveFrameType = boardData.config.imageFrameType; // This is the new board default

                    if (effectiveFrameType === 'circle') {
                        if (item.width !== item.height) {
                            const size = Math.max(item.width, item.height);
                            item.width = size;
                            item.height = size;
                        }
                    }
                    // If changing away from circle, items that were square (due to previous circle default) remain square.
                    // No automatic resizing back to original aspect ratio for simplicity.
                }
            }
        }
        await this.saveBoardData(boardId, boardData); 
    }

    static async addItem(boardId, itemData) {
        const boardData = this.getBoardData(boardId);
        if (!boardData) {
            console.error(`${MODULE_ID} | addItem: Board with ID ${boardId} not found.`);
            return null; 
        }
        if (!boardData.items) { 
            boardData.items = {};
        }
        const itemId = itemData.id || foundry.utils.randomID();
        itemData.id = itemId;
        
        if (!itemData.creatorUserId) {
            itemData.creatorUserId = game.user.id; 
        }
        if (typeof itemData.isHiddenFromPlayer === 'undefined') {
            itemData.isHiddenFromPlayer = false; 
        }

        // Ensure base dimensions are set if not provided
        if (itemData.type === 'actor' || itemData.isCustomImage || itemData.isPlaceholder) {
            itemData.width = itemData.width || DEFAULT_ACTOR_ITEM_WIDTH;
            itemData.height = itemData.height || DEFAULT_ACTOR_ITEM_HEIGHT;
            if (typeof itemData.imageFrameType === 'undefined') {
                itemData.imageFrameType = 'board_default';
            }
        } else if (itemData.type === 'note') {
            itemData.width = itemData.width || DEFAULT_NOTE_WIDTH;
            itemData.height = itemData.height || DEFAULT_NOTE_HEIGHT;
        } else if (itemData.type === 'node') {
            itemData.width = itemData.width || DEFAULT_NODE_WIDTH;
            itemData.height = itemData.height || DEFAULT_NODE_HEIGHT;
        }

        // Adjust width/height for circular actor-like items
        if (itemData.type === 'actor' || itemData.isCustomImage || itemData.isPlaceholder) {
            let resolvedFrameType = itemData.imageFrameType;
            if (resolvedFrameType === 'board_default') {
                resolvedFrameType = boardData.config?.imageFrameType || "photo";
            }

            if (resolvedFrameType === 'circle') {
                if (itemData.width !== itemData.height) {
                    const size = Math.max(itemData.width, itemData.height);
                    itemData.width = size;
                    itemData.height = size;
                }
            }
        }
        
        boardData.items[itemId] = itemData;
        await this.saveBoardData(boardId, boardData); 
        return foundry.utils.deepClone(boardData);
    }
	
    static async updateItem(boardId, itemId, itemUpdates) {
        const boardData = this.getBoardData(boardId);
        if (!boardData || !boardData.items[itemId]) return;

        const currentItem = boardData.items[itemId];
        
        // Create a temporary merged item to determine final properties
        const MOCK_NO_CHANGE = "__MOCK_NO_CHANGE__"; // Special value to detect no actual change
        const tempUpdatedItem = { 
            ...currentItem, 
            ...itemUpdates,
            // Ensure width/height are numbers if updated, or fall back to current
            width: itemUpdates.width !== undefined ? parseFloat(itemUpdates.width) : currentItem.width,
            height: itemUpdates.height !== undefined ? parseFloat(itemUpdates.height) : currentItem.height,
            imageFrameType: itemUpdates.imageFrameType !== undefined ? itemUpdates.imageFrameType : currentItem.imageFrameType
        };


        if (tempUpdatedItem.type === 'actor' || tempUpdatedItem.isCustomImage || tempUpdatedItem.isPlaceholder) {
            let finalFrameType = tempUpdatedItem.imageFrameType;
            if (finalFrameType === 'board_default') {
                finalFrameType = boardData.config?.imageFrameType || 'photo';
            }

            if (finalFrameType === 'circle') {
                // If frame type is changing to circle OR is circle and dimensions are touched OR dimensions are unequal
                const isBecomingCircle = itemUpdates.imageFrameType !== undefined && finalFrameType === 'circle' && (currentItem.imageFrameType !== 'circle' && (currentItem.imageFrameType !== 'board_default' || boardData.config?.imageFrameType !== 'circle'));
                const isCircleAndDimsTouched = finalFrameType === 'circle' && (itemUpdates.width !== undefined || itemUpdates.height !== undefined);
                const isCircleAndUnequal = finalFrameType === 'circle' && tempUpdatedItem.width !== tempUpdatedItem.height;

                if (isBecomingCircle || isCircleAndDimsTouched || isCircleAndUnequal) {
                    let baseWidth = tempUpdatedItem.width;
                    let baseHeight = tempUpdatedItem.height;
                
                    if (itemUpdates.width !== undefined && itemUpdates.height === undefined) {
                        // Width updated, height should match
                        baseHeight = baseWidth;
                    } else if (itemUpdates.height !== undefined && itemUpdates.width === undefined) {
                        // Height updated, width should match
                        baseWidth = baseHeight;
                    }
                    // If both or neither are updated, or if it's just becoming circle, use max
                    const size = Math.max(baseWidth, baseHeight);
                    itemUpdates.width = size; // Ensure itemUpdates gets the potentially new values
                    itemUpdates.height = size;
                }
            }
        }
        
        boardData.items[itemId] = { ...currentItem, ...itemUpdates };
        
        // Final check to ensure consistency if item is a circle after all updates applied
        // This handles cases where itemUpdates didn't touch width/height but frameType implies circle
        let finalEffectiveFrameType = boardData.items[itemId].imageFrameType;
        if (finalEffectiveFrameType === 'board_default') {
            finalEffectiveFrameType = boardData.config?.imageFrameType || 'photo';
        }

        if ((boardData.items[itemId].type === 'actor' || boardData.items[itemId].isCustomImage || boardData.items[itemId].isPlaceholder) && finalEffectiveFrameType === 'circle') {
            if (boardData.items[itemId].width !== boardData.items[itemId].height) {
                const size = Math.max(boardData.items[itemId].width, boardData.items[itemId].height);
                boardData.items[itemId].width = size;
                boardData.items[itemId].height = size;
            }
        }

        await this.saveBoardData(boardId, boardData); 
    }
    
    static async deleteItem(boardId, itemId) {
        const boardData = this.getBoardData(boardId);
        if (!boardData) return;
        
        if (boardData.items && boardData.items[itemId]) {
            delete boardData.items[itemId];
        } else {
            console.warn(`${MODULE_ID} | ClueBoardData.deleteItem: Item ${itemId} not found on board ${boardId} for deletion.`);
        }

        if (boardData.connections && Array.isArray(boardData.connections)) {
            boardData.connections = boardData.connections.filter(conn => conn.fromItemId !== itemId && conn.toItemId !== itemId);
        } else {
            boardData.connections = []; 
        }

        // Also remove item from itemSelections
        if (boardData.itemSelections && boardData.itemSelections[itemId]) {
            delete boardData.itemSelections[itemId];
        }
        
        await this.saveBoardData(boardId, boardData); 
    }

    static async addConnection(boardId, fromItemId, toItemId) {
        const boardData = this.getBoardData(boardId);
        if (!boardData) return;
        if (!boardData.connections || !Array.isArray(boardData.connections)) {
            boardData.connections = [];
        }
        const connId = foundry.utils.randomID();
        const newConnection = { id: connId, fromItemId, toItemId, creatorUserId: game.user.id };
        boardData.connections.push(newConnection);
        await this.saveBoardData(boardId, boardData); 
        return connId;
    }

    static async deleteConnection(boardId, connectionId) {
        const boardData = this.getBoardData(boardId);
        if (!boardData || !boardData.connections || !Array.isArray(boardData.connections)) return;
        boardData.connections = boardData.connections.filter(conn => conn.id !== connectionId);
        await this.saveBoardData(boardId, boardData); 
    }

    // --- User Item Selection Circles ---
    static async addUserSelectionToItem(boardId, itemId, userId) {
        const boardData = this.getBoardData(boardId);
        if (!boardData || !boardData.items[itemId]) return;

        if (!boardData.itemSelections) {
            boardData.itemSelections = {};
        }
        if (!boardData.itemSelections[itemId]) {
            boardData.itemSelections[itemId] = [];
        }

        if (!boardData.itemSelections[itemId].includes(userId)) {
            boardData.itemSelections[itemId].push(userId);
            await this.saveBoardData(boardId, boardData);
        }
    }

    static async removeUserSelectionFromItem(boardId, itemId, userId) {
        const boardData = this.getBoardData(boardId);
        if (!boardData || !boardData.items[itemId] || !boardData.itemSelections || !boardData.itemSelections[itemId]) {
            return;
        }

        const initialLength = boardData.itemSelections[itemId].length;
        boardData.itemSelections[itemId] = boardData.itemSelections[itemId].filter(uid => uid !== userId);

        if (boardData.itemSelections[itemId].length === 0) {
            delete boardData.itemSelections[itemId];
        }

        // Only save if a change actually occurred
        if (boardData.itemSelections[itemId]?.length !== initialLength || (!boardData.itemSelections[itemId] && initialLength > 0)) {
            await this.saveBoardData(boardId, boardData);
        }
    }
}