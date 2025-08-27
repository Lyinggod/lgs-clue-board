// scripts/ClueNodeConfigDialog.js
import { MODULE_ID, TEMPLATES } from './constants.js';
import { ClueBoardData } from './ClueBoardData.js';

export class ClueNodeConfigDialog extends FormApplication {
    constructor(boardId, itemId, clueBoardApp, options = {}) {
        super({}, options);
        this.boardId = boardId;
        this.itemId = itemId;
        this.itemData = foundry.utils.deepClone(ClueBoardData.getBoardData(boardId).items[itemId]);
        this.clueBoardApp = clueBoardApp; // Reference to main board app
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: `${MODULE_ID}-clue-node-config`,
            classes: [MODULE_ID, "clue-node-config-dialog"],
            template: TEMPLATES.CLUE_NODE_CONFIG_DIALOG,
            width: 400,
            height: 'auto',
            resizable: true,
            title: game.i18n.localize("LGS_CB2.NodeConfig.Title"),
        });
    }

    getData(options) {
        const isGM = game.user.isGM;
        let connections = [];

        if (isGM) {
            const boardData = ClueBoardData.getBoardData(this.boardId);
            if (boardData && boardData.connections) {
                connections = boardData.connections
                    .filter(conn => conn.fromItemId === this.itemId || conn.toItemId === this.itemId)
                    .map(conn => {
                        const otherItemId = conn.fromItemId === this.itemId ? conn.toItemId : conn.fromItemId;
                        const otherItem = boardData.items[otherItemId];
                        let displayText = `Item ID: ${otherItemId}`; // Fallback
                        if (otherItem) {
                            if (otherItem.type === 'actor' || (otherItem.clueName && otherItem.clueName.trim() !== '')) {
                                displayText = otherItem.clueName || 'Unnamed Actor';
                            } else if (otherItem.type === 'note') {
                                const noteText = otherItem.playerText || otherItem.gmText || '';
                                displayText = noteText.substring(0, 20) + (noteText.length > 20 ? '...' : '') || 'Empty Note';
                            } else if (otherItem.type === 'node') {
                                displayText = otherItem.clueName || 'Node'; // Use the node's own name
                            }
                        }
                        return {
                            id: conn.id,
                            displayText: `↔ ${displayText}`
                        };
                    });
            }
        }
        
        if (this.clueBoardApp && this.clueBoardApp.rendered) {
            this.clueBoardApp.showNodeCounters(true, this.itemId);
        }


        return {
            item: this.itemData,
            isGM: isGM,
            MODULE_ID: MODULE_ID,
            connections: connections
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        if (game.user.isGM) {
            html.find('.delete-connection').on('click', async (event) => {
                event.preventDefault();
                const connectionId = $(event.currentTarget).closest('li').data('connectionId');
                if (connectionId) {
                    await this._onDeleteConnection(connectionId);
                }
            });
        }
        
        html.find('.dialog-close').on('click', () => this.close());
    }
    
    async close(options) {
        if (this.clueBoardApp && this.clueBoardApp.rendered) {
            this.clueBoardApp.showNodeCounters(false);
        }
        return super.close(options);
    }


    async _onDeleteConnection(connectionId) {
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize("LGS_CB2.ConfirmDeleteConnectionTitle"),
            content: `<p>${game.i18n.localize("LGS_CB2.ConfirmDeleteConnectionContent")}</p>`,
        });

        if (confirmed) {
            // 1. Update persistent data and broadcast
            await ClueBoardData.deleteConnection(this.boardId, connectionId);
            
            // 2. Re-render this config dialog to update its connections list
            this.render(true); 
            
            // 3. Re-render the main ClueBoardDialog if it's open
            if (this.clueBoardApp && this.clueBoardApp.rendered) {
                this.clueBoardApp.currentBoardData = ClueBoardData.getBoardData(this.boardId); // Refresh its data
                this.clueBoardApp.render(false); // Force re-render of board connections
            }
        }
    }

    async _updateObject(event, formData) {
        // This dialog doesn't save item properties, only deletes connections.
    }
}