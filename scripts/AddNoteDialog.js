// scripts/AddNoteDialog.js
import { MODULE_ID, TEMPLATES, DEFAULT_NOTE_WIDTH, DEFAULT_NOTE_HEIGHT } from './constants.js';
import { ClueBoardData } from './ClueBoardData.js';
import { socketController } from './SocketController.js';

export class AddNoteDialog extends FormApplication {
    constructor(boardId, itemDataOrPosition, options = {}) {
        super({}, options);
        this.boardId = boardId;

        if (typeof itemDataOrPosition === 'string') { 
            this.itemId = itemDataOrPosition;
            this.itemData = foundry.utils.deepClone(ClueBoardData.getBoardData(this.boardId).items[this.itemId]);
            if (typeof this.itemData.isHiddenFromPlayer === 'undefined') {
                this.itemData.isHiddenFromPlayer = false;
            }
            this.isEditMode = true;
        } else { 
            this.position = itemDataOrPosition; 
            this.itemData = { 
                playerText: "",
                gmText: "",
                fontSize: 16,
                isHiddenFromPlayer: itemDataOrPosition.isHiddenFromPlayer || false 
            };
            this.isEditMode = false;
        }
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: `${MODULE_ID}-add-edit-note`,
            template: TEMPLATES.ADD_NOTE_DIALOG,
            width: 400,
            height: 'auto',
            classes: [MODULE_ID, "add-note-dialog"],
            submitOnChange: false,
            closeOnSubmit: true, 
        });
    }

    get title() {
        return game.i18n.localize(this.isEditMode ? 'LGS_CB2.EditNoteDialog.Title' : 'LGS_CB2.AddNoteDialog.Title');
    }

    getData(options) {
        const isGM = game.user.isGM;
        let connections = [];

        if (isGM && this.isEditMode) {
            const boardData = ClueBoardData.getBoardData(this.boardId);
            if (boardData && boardData.items && boardData.connections) {
                connections = boardData.connections
                    .filter(conn => conn.fromItemId === this.itemId || conn.toItemId === this.itemId)
                    .map(conn => {
                        const otherItemId = conn.fromItemId === this.itemId ? conn.toItemId : conn.fromItemId;
                        const otherItem = boardData.items[otherItemId];
                        let displayText = `Item ID: ${otherItemId}`;
                        if (otherItem) {
                             if (otherItem.isHiddenFromPlayer && !isGM) {
                                displayText = game.i18n.localize("LGS_CB2.HiddenItem");
                            } else if (otherItem.type === 'actor' || (otherItem.clueName && otherItem.clueName.trim() !== '')) {
                                displayText = otherItem.clueName || 'Unnamed Actor';
                            } else if (otherItem.type === 'note') {
                                const noteText = otherItem.playerText || otherItem.gmText || '';
                                displayText = noteText.substring(0, 20) + (noteText.length > 20 ? '...' : '') || 'Empty Note';
                            } else if (otherItem.type === 'node') {
                                displayText = otherItem.clueName || 'Node';
                            }
                        }
                        return {
                            id: conn.id,
                            displayText: `↔ ${displayText}`
                        };
                    });
            }
        }
        
        // For new notes, especially hidden ones, ensure the data object reflects the initial state for the template
        const dataForTemplate = foundry.utils.deepClone(this.itemData);
        if (!this.isEditMode && this.itemData.isHiddenFromPlayer) {
             dataForTemplate.isHiddenFromPlayer = true;
        }


        return {
            isGM: isGM,
            MODULE_ID: MODULE_ID,
            data: dataForTemplate, // Use the potentially modified clone for template
            isEditMode: this.isEditMode,
            connections: connections
        };
    }
	
	async _render(force = false, options = {}) {
        await super._render(force, options);
        // Force a high z-index to ensure it appears over the clue board
        if (this.element && this.element.length) {
            this.element.css('z-index', 300);
        }
    }

    activateListeners(html) {
        super.activateListeners(html);
        const fontSizeSlider = html.find('input[name="fontSize"]');
        const fontSizeValueDisplay = html.find('input[name="fontSize"] + .range-value');

        if (fontSizeSlider.length && fontSizeValueDisplay.length) {
            fontSizeValueDisplay.text(fontSizeSlider.val() + 'px');
        }

        fontSizeSlider.on('input', (event) => {
            if (fontSizeValueDisplay.length) {
                fontSizeValueDisplay.text($(event.currentTarget).val() + 'px');
            }
        });

        if (game.user.isGM && this.isEditMode) {
            html.find('.delete-connection').on('click', async (event) => {
                event.preventDefault();
                const connectionId = $(event.currentTarget).closest('li').data('connectionId');
                if (connectionId) {
                    await this._onDeleteConnection(connectionId);
                }
            });
        }
        // Checkbox for isHiddenFromPlayer in template is bound to `data.isHiddenFromPlayer`
        // If GM creates a hidden note, this.itemData.isHiddenFromPlayer is true.
        // The getData method ensures `data.isHiddenFromPlayer` is true for the template.
        // So the checkbox will be correctly checked by Handlebars `{{checked data.isHiddenFromPlayer}}`.
    }

    async _onDeleteConnection(connectionId) {
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize("LGS_CB2.ConfirmDeleteConnectionTitle"),
            content: `<p>${game.i18n.localize("LGS_CB2.ConfirmDeleteConnectionContent")}</p>`,
            yes: () => true,
            no: () => false,
            defaultYes: false
        });

        if (confirmed) {
            await ClueBoardData.deleteConnection(this.boardId, connectionId);
            this.render(true); 
            const clueBoardApp = Object.values(ui.windows).find(
                app => app.constructor.name === 'ClueBoardDialog' && app.boardId === this.boardId && app.rendered
            );
            if (clueBoardApp) {
                clueBoardApp.currentBoardData = ClueBoardData.getBoardData(this.boardId); 
                clueBoardApp.render(false);
            }
        }
    }

    async _updateObject(event, formData) {
        const isGM = game.user.isGM;

        if (this.isEditMode) {
            const updates = {
                playerText: formData.playerText || "",
                fontSize: parseInt(formData.fontSize) || 16,
            };

            if (isGM) {
                updates.gmText = formData.gmText || "";
                updates.isHiddenFromPlayer = formData.isHiddenFromPlayer || false;
                await ClueBoardData.updateItem(this.boardId, this.itemId, updates);

                // Find the open clue board and force a re-render for the GM to see immediate changes
                const clueBoardApp = Object.values(ui.windows).find(
                    app => app.constructor.name === 'ClueBoardDialog' && app.boardId === this.boardId && app.rendered
                );
                if (clueBoardApp) {
                    // Get the absolute latest data from the source
                    const updatedBoardData = ClueBoardData.getBoardData(this.boardId);
                    if (updatedBoardData) {
                        clueBoardApp.currentBoardData = updatedBoardData;
                        clueBoardApp.render(false); // Re-render the board to show the icon and update hover data
                    }
                }
            } else {
                // Player sends request to GM. Form prevents editing GM-only fields.
                socketController.requestItemUpdate(this.boardId, this.itemId, updates);
            }
        } else {
            // Creating a new note
            let isHiddenVal = false;
            if (isGM) {
                isHiddenVal = typeof formData.isHiddenFromPlayer !== 'undefined' ? formData.isHiddenFromPlayer : this.itemData.isHiddenFromPlayer;
            }

            const newNoteData = {
                type: 'note',
                x: this.position.x, 
                y: this.position.y, 
                width: DEFAULT_NOTE_WIDTH,
                height: DEFAULT_NOTE_HEIGHT,
                gmText: isGM ? (formData.gmText || "") : "", 
                playerText: formData.playerText || "",
                fontSize: parseInt(formData.fontSize) || 16,
                img: `modules/${MODULE_ID}/assets/note_white.webp`,
                isLocked: false,
                isHiddenFromPlayer: isHiddenVal,
                creatorUserId: game.user.id // Set creator
            };

            const boardDataForConstraints = ClueBoardData.getBoardData(this.boardId);
            if (boardDataForConstraints && boardDataForConstraints.config) {
               newNoteData.x = Math.max(0, Math.min(newNoteData.x, boardDataForConstraints.config.width - newNoteData.width));
               newNoteData.y = Math.max(0, Math.min(newNoteData.y, boardDataForConstraints.config.height - newNoteData.height));
            }

            if (isGM) {
                const updatedBoardData = await ClueBoardData.addItem(this.boardId, newNoteData);
                if (updatedBoardData) {
                    const clueBoardApp = Object.values(ui.windows).find(
                        app => app.constructor.name === 'ClueBoardDialog' && app.boardId === this.boardId && app.rendered
                    );
                    if (clueBoardApp) {
                        clueBoardApp.currentBoardData = updatedBoardData;
                        clueBoardApp.render(false);
                    }
                }
            } else {
                const newId = foundry.utils.randomID();
                newNoteData.id = newId;

                // Optimistic update for the player for immediate feedback
                const clueBoardApp = Object.values(ui.windows).find(app => app.id === `${MODULE_ID}-board-${this.boardId}` && app.rendered);
                if (clueBoardApp) {
                    if (!clueBoardApp.currentBoardData.items) clueBoardApp.currentBoardData.items = {};
                    clueBoardApp.currentBoardData.items[newId] = newNoteData;
                    clueBoardApp.render(false);
                }
                
                socketController.requestAddItemToServer(this.boardId, newNoteData);
            }
        }
    }
}