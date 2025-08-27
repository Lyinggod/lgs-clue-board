// scripts/ClueItemConfigDialog.js
import { MODULE_ID, TEMPLATES } from './constants.js';
import { ClueBoardData } from './ClueBoardData.js';

export class ClueItemConfigDialog extends FormApplication {
    constructor(boardId, itemId, clueBoardApp, options = {}) { 
        super({}, options);
        this.boardId = boardId;
        this.itemId = itemId;
        this.clueBoardApp = clueBoardApp; 
        this.playerEditMode = options.playerEditMode || false;
        
        this.itemData = foundry.utils.deepClone(ClueBoardData.getBoardData(boardId).items[itemId]);
        if (this.itemData.type === 'actor' && typeof this.itemData.originalActorImg === 'undefined') {
            this.itemData.originalActorImg = this.itemData.img; 
        }
        if (typeof this.itemData.isHiddenFromPlayer === 'undefined') {
            this.itemData.isHiddenFromPlayer = false;
        }
        if (this.itemData.type === 'actor' && typeof this.itemData.isBlurred === 'undefined') {
            this.itemData.isBlurred = false;
        }
        if ((this.itemData.type === 'actor' || this.itemData.isCustomImage || this.itemData.isPlaceholder) && typeof this.itemData.imageFrameType === 'undefined') {
            this.itemData.imageFrameType = 'board_default';
        }
        if (!this.itemData.playerNotes) this.itemData.playerNotes = "";
        if (!this.itemData.gmNotes) this.itemData.gmNotes = "";
        
        this.originalItemData = foundry.utils.deepClone(this.itemData); 
        this.saved = false; 
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: `${MODULE_ID}-clue-item-config`,
            classes: [MODULE_ID, "clue-item-config-dialog"],
            template: TEMPLATES.CLUE_ITEM_CONFIG_DIALOG,
            width: 450,
            height: 'auto', 
            resizable: true,
            submitOnChange: false, 
            closeOnSubmit: true, 
        });
    }

    get title() {
        return game.i18n.format("LGS_CB2.ClueItemConfig.Title", { name: this.itemData.clueName || this.itemData.type });
    }

    getData(options) {
        const isGM = game.user.isGM;
        const canEditName = isGM || (this.playerEditMode && !this.itemData.lockClueName) || (!this.playerEditMode && !this.itemData.lockClueName) ;
        
        let connections = [];
        if (isGM && !this.playerEditMode) {
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
                        return { id: conn.id, displayText: `↔ ${displayText}` };
                    });
            }
        }

        const itemImageFrameTypes = [
            { value: "board_default", label: game.i18n.localize("LGS_CB2.ImageFrameType.BoardDefault") },
            { value: "photo", label: game.i18n.localize("LGS_CB2.ImageFrameType.Photo") },
            { value: "circle", label: game.i18n.localize("LGS_CB2.ImageFrameType.Circle") },
            { value: "square", label: game.i18n.localize("LGS_CB2.ImageFrameType.Square") }
        ];

        if ((this.itemData.type === 'actor' || this.itemData.isCustomImage || this.itemData.isPlaceholder) && typeof this.itemData.imageFrameType === 'undefined') {
            this.itemData.imageFrameType = 'board_default';
        }


        return {
            item: this.itemData, 
            isGM: isGM,
            canEditName: canEditName,
            playerEditMode: this.playerEditMode,
            MODULE_ID: MODULE_ID,
            connections: connections,
            itemImageFrameTypes: itemImageFrameTypes
        };
    }

    _updatePreview(fieldName = "N/A") {
        if (this.clueBoardApp && this.clueBoardApp.rendered) {
            const previewData = foundry.utils.deepClone(this.itemData);
            this.clueBoardApp.previewItemUpdate(this.itemId, previewData);
        }
    }

activateListeners(html) {
    super.activateListeners(html);

    const isGM = game.user.isGM;
    const canEditName = isGM || (this.playerEditMode && !this.itemData.lockClueName) || (!this.playerEditMode && !this.itemData.lockClueName);

    if (canEditName) {
        html.find('input[name="clueName"]').on('input', (event) => {
            this.itemData.clueName = $(event.currentTarget).val();
            this._updatePreview('clueName'); 
        });
    }

    if (isGM && !this.playerEditMode) {
        html.find('input[name="img"]').on('change', (event) => {
            this.itemData.img = $(event.currentTarget).val();
            this._updatePreview('img');
        });

        html.find('button.reset-image').on('click', (event) => {
            event.preventDefault();
            if (this.itemData.type === 'actor' && this.itemData.originalActorImg) {
                this.itemData.img = this.itemData.originalActorImg;
                html.find('input[name="img"]').val(this.itemData.img); 
                this._updatePreview('img (reset)');
            }
        });
        
        html.find('input[name="actorImageScale"]').on('input', (event) => {
            const value = parseFloat($(event.currentTarget).val());
            this.itemData.actorImageScale = value;
            $(event.currentTarget).next('.range-value').text(value + 'x');
            this._updatePreview('actorImageScale');
        });

        html.find('input[name="actorImageOffsetX"]').on('input', (event) => {
            const value = parseInt($(event.currentTarget).val());
            this.itemData.actorImageOffsetX = value;
            $(event.currentTarget).next('.range-value').text(value + 'px');
            this._updatePreview('actorImageOffsetX');
        });

        html.find('input[name="actorImageOffsetY"]').on('input', (event) => {
            const value = parseInt($(event.currentTarget).val());
            this.itemData.actorImageOffsetY = value;
            $(event.currentTarget).next('.range-value').text(value + 'px');
            this._updatePreview('actorImageOffsetY');
        });

        html.find('input[name="isBlurred"]').on('change', (event) => {
            this.itemData.isBlurred = $(event.currentTarget).is(':checked');
            this._updatePreview('isBlurred');
        });

        html.find('input[name="isDead"]').on('change', (event) => {
            this.itemData.isDead = $(event.currentTarget).is(':checked');
            this._updatePreview('isDead');
        });

        html.find('input[name="isCaptured"]').on('change', (event) => {
            this.itemData.isCaptured = $(event.currentTarget).is(':checked');
            this._updatePreview('isCaptured');
        });
        
        html.find('input[name="isHiddenFromPlayer"]').on('change', (event) => {
            this.itemData.isHiddenFromPlayer = $(event.currentTarget).is(':checked');
            this._updatePreview('isHiddenFromPlayer'); 
        });

        html.find('select[name="imageFrameType"]').on('change', (event) => {
            this.itemData.imageFrameType = $(event.currentTarget).val();
            
            // If changed to circle (or board default is circle), adjust width/height in this.itemData for preview
            if (this.itemData.type === 'actor' || this.itemData.isCustomImage || this.itemData.isPlaceholder) {
                let effectiveFrameType = this.itemData.imageFrameType;
                if (effectiveFrameType === 'board_default') {
                    const boardConfig = ClueBoardData.getBoardData(this.boardId)?.config;
                    effectiveFrameType = boardConfig?.imageFrameType || 'photo';
                }
                if (effectiveFrameType === 'circle') {
                    if (this.itemData.width !== this.itemData.height) {
                        const size = Math.max(this.itemData.width, this.itemData.height);
                        this.itemData.width = size;
                        this.itemData.height = size;
                    }
                }
            }
            this._updatePreview('imageFrameType_and_dims'); // Indicate dims might also change for preview
        });

        html.find('textarea[name="playerNotes"]').on('input', (event) => {
            this.itemData.playerNotes = $(event.currentTarget).val();
            this._updatePreview('playerNotes');
        });

        html.find('textarea[name="gmNotes"]').on('input', (event) => {
            this.itemData.gmNotes = $(event.currentTarget).val();
        });

        html.find('input[name="lockClueName"]').on('change', (event) => {
            this.itemData.lockClueName = $(event.currentTarget).is(':checked');
        });

        html.find('.delete-connection').on('click', async (event) => {
            event.preventDefault();
            const connectionId = $(event.currentTarget).closest('li').data('connectionId');
            if (connectionId) {
                await this._onDeleteConnection(connectionId);
            }
        });
    }
}
    async _onDeleteConnection(connectionId) {
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize("LGS_CB2.ConfirmDeleteConnectionTitle"),
            content: `<p>${game.i18n.localize("LGS_CB2.ConfirmDeleteConnectionContent")}</p>`,
            yes: () => true, no: () => false, defaultYes: false
        });

        if (confirmed) {
            await ClueBoardData.deleteConnection(this.boardId, connectionId);
            
            const currentBoardState = ClueBoardData.getBoardData(this.boardId);
            if (currentBoardState && currentBoardState.items && currentBoardState.items[this.itemId]) {
                this.itemData = foundry.utils.deepClone(currentBoardState.items[this.itemId]);
                if (this.itemData.type === 'actor' && typeof this.itemData.originalActorImg === 'undefined') {
                    this.itemData.originalActorImg = this.itemData.img;
                }
                 if (typeof this.itemData.isHiddenFromPlayer === 'undefined') { 
                    this.itemData.isHiddenFromPlayer = false;
                }
                if ((this.itemData.type === 'actor' || this.itemData.isCustomImage || this.itemData.isPlaceholder) && typeof this.itemData.imageFrameType === 'undefined') {
                    this.itemData.imageFrameType = 'board_default';
                }
                this.originalItemData = foundry.utils.deepClone(this.itemData);
            } else {
                this.close(); return;
            }
            this.render(true); 
            if (this.clueBoardApp && this.clueBoardApp.rendered) {
                this.clueBoardApp.currentBoardData = currentBoardState; 
                this.clueBoardApp.render(false); 
            }
        }
    }

    async _updateObject(event, formData) {
        this.saved = true;
        const isGM = game.user.isGM;
        const boardData = ClueBoardData.getBoardData(this.boardId);

        // Ensure this.itemData has the latest values from form interaction (already done by listeners)
        // Now, apply circle logic to this.itemData before creating updatesToSave
        if (this.itemData.type === 'actor' || this.itemData.isCustomImage || this.itemData.isPlaceholder) {
            let effectiveFrameType = this.itemData.imageFrameType;
            if (effectiveFrameType === 'board_default' && boardData && boardData.config) {
                effectiveFrameType = boardData.config.imageFrameType || 'photo';
            }

            if (effectiveFrameType === 'circle') {
                if (this.itemData.width !== this.itemData.height) {
                    const size = Math.max(parseFloat(this.itemData.width) || 0, parseFloat(this.itemData.height) || 0);
                    this.itemData.width = size;
                    this.itemData.height = size;
                }
            }
        }

        const updatesToSave = {};

        if (this.playerEditMode) { 
            if (!this.originalItemData.lockClueName) {
                if (this.itemData.clueName !== this.originalItemData.clueName) {
                    updatesToSave.clueName = this.itemData.clueName;
                }
            } else {
                ui.notifications.warn(game.i18n.localize("LGS_CB2.Notifications.ItemNameLocked"));
                this.saved = false; return;
            }
        } else if (isGM) { 
            const fieldsToCompare = [
                'clueName', 'img', 'actorImageScale', 'actorImageOffsetX', 'actorImageOffsetY',
                'isBlurred', 'isDead', 'isCaptured', 'isHiddenFromPlayer', 'playerNotes', 
                'lockClueName', 'gmNotes', 'originalActorImg', 'imageFrameType',
                'width', 'height' // Added width and height
            ];

            for (const field of fieldsToCompare) {
                const currentFieldValue = foundry.utils.getProperty(this.itemData, field);
                const originalFieldValue = foundry.utils.getProperty(this.originalItemData, field);

                let compCurrent = currentFieldValue;
                let compOriginal = originalFieldValue;

                // Convert numeric fields to numbers for comparison, handle undefined/null
                if (['actorImageScale', 'actorImageOffsetX', 'actorImageOffsetY', 'width', 'height'].includes(field)) {
                    compCurrent = currentFieldValue !== undefined && currentFieldValue !== null ? parseFloat(currentFieldValue) : null;
                    compOriginal = originalFieldValue !== undefined && originalFieldValue !== null ? parseFloat(originalFieldValue) : null;
                }
                
                if (compCurrent !== compOriginal) {
                    updatesToSave[field] = currentFieldValue;
                }
            }
        } else {
            this.saved = false;
            return;
        }

        if (Object.keys(updatesToSave).length > 0) {
            await ClueBoardData.updateItem(this.boardId, this.itemId, updatesToSave);
        } else {
            this.saved = false; 
        }
    }

    async close(options = {}) {
        const wasSaved = this.saved; 
        const result = await super.close(options); 

        if (this.clueBoardApp && this.clueBoardApp.rendered) {
            if (!wasSaved) {
                if (this.clueBoardApp.currentBoardData.items[this.itemId]) {
                    this.clueBoardApp.currentBoardData.items[this.itemId] = foundry.utils.deepClone(this.originalItemData);
                }
                this.clueBoardApp.clearItemPreview(this.itemId, false);
                this.clueBoardApp.render(false);
            } else {
                this.clueBoardApp.currentBoardData = ClueBoardData.getBoardData(this.boardId);
                this.clueBoardApp.clearItemPreview(this.itemId, true);
                this.clueBoardApp.render(false);
            }
        }
        return result;
    }
}