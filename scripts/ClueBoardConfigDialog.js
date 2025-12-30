// scripts/ClueBoardConfigDialog.js
import { MODULE_ID, TEMPLATES } from './constants.js'; 
import { ClueBoardData } from './ClueBoardData.js';     

export class ClueBoardConfigDialog extends FormApplication {
    constructor(boardId, parentBoardDialog, options = {}) {
        super(ClueBoardData.getBoardData(boardId).config, options);
        this.boardId = boardId;
        this.parentBoardDialog = parentBoardDialog;
        // Store the original config to revert if the dialog is cancelled
        this.originalConfig = foundry.utils.deepClone(ClueBoardData.getBoardData(boardId).config);
        // This is the working copy that gets modified by user interaction.
        this.currentConfig = foundry.utils.deepClone(this.originalConfig);
        this.submitted = false; // Flag to track if the save button was clicked

        if (typeof this.currentConfig.globalItemScale === 'undefined') {
            this.currentConfig.globalItemScale = 1.0;
        }
        if (typeof this.currentConfig.imageFrameType === 'undefined') {
            this.currentConfig.imageFrameType = "photo";
        }

        if (this.currentConfig.lockBackgroundScaleProportion &&
            this.currentConfig.backgroundScaleX && 
            this.currentConfig.backgroundScaleY && 
            parseFloat(this.currentConfig.backgroundScaleY) !== 0) {
            this.lockedAspectRatio = parseFloat(this.currentConfig.backgroundScaleX) / parseFloat(this.currentConfig.backgroundScaleY);
        } else {
            this.lockedAspectRatio = null; 
        }
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: `${MODULE_ID}-board-config`,
            title: game.i18n.localize('LGS_CB2.ConfigTitle'),
            template: TEMPLATES.CLUE_BOARD_CONFIG,
            width: 500,
            height: 'auto',
            classes: [MODULE_ID, "clue-board-config-dialog"],
            submitOnChange: false,
            closeOnSubmit: true,
        });
    }

    getData() {
        const configForTemplate = foundry.utils.deepClone(this.currentConfig);
        if (typeof configForTemplate.globalItemScale === 'undefined') {
            configForTemplate.globalItemScale = 1.0;
        }
        if (typeof configForTemplate.imageFrameType === 'undefined') {
            configForTemplate.imageFrameType = "photo";
        }
        // --- MODIFICATION START ---
        const imageFrameTypes = [
            { value: "photo", label: game.i18n.localize("LGS_CB2.ImageFrameType.Photo") },
            { value: "circle", label: game.i18n.localize("LGS_CB2.ImageFrameType.Circle") },
            { value: "square", label: game.i18n.localize("LGS_CB2.ImageFrameType.Square") },
            { value: "unframed", label: game.i18n.localize("LGS_CB2.ImageFrameType.Unframed") }
        ];
        // --- MODIFICATION END ---

        return {
            config: configForTemplate, 
            MODULE_ID: MODULE_ID,
            imageFrameTypes: imageFrameTypes
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find('input[type="range"]').on('input', this._onRangeChange.bind(this));
        html.find('input[type="checkbox"], input[type="text"][name="config.backgroundImage"], select[name="config.imageFrameType"]')
            .on('change', this._onInputChange.bind(this));

        // New listener for the cancel button
        html.find('.cancel-button').on('click', (event) => {
            event.preventDefault();
            this.close();
        });

        html.find('input[type="range"]').each((idx, el) => {
            const input = $(el);
            const nameAttr = input.attr('name');
            const configName = nameAttr.substring(nameAttr.indexOf('.') + 1);
            const currentValue = foundry.utils.getProperty(this.currentConfig, configName);

            if (nameAttr === 'config.globalItemScale') {
                const scaleValue = typeof currentValue !== 'undefined' ? parseFloat(currentValue) : 1.0;
                input.next('.range-value').text(Math.round(scaleValue * 100) + '%');
            } else {
                const isBgScale = nameAttr ? nameAttr.includes('Scale') && !nameAttr.includes('globalItemScale') : false;
                input.next('.range-value').text(currentValue + (isBgScale ? 'px' : 'px'));
            }
        });
    }

    async _onFilePicker(event) {
       // Standard FormApplication handling
    }


    _onRangeChange(event) {
        const input = $(event.currentTarget);
        const name = input.attr('name').split('.')[1];
        let value = (name === 'globalItemScale') ? parseFloat(input.val()) : parseInt(input.val());
        
        if (name === 'globalItemScale') {
            input.next('.range-value').text(Math.round(value * 100) + '%');
        } else {
            const isBgScale = name.includes('Scale') && name !== 'globalItemScale';
            input.next('.range-value').text(value + (isBgScale ? 'px' : 'px'));
        }

        foundry.utils.setProperty(this.currentConfig, name, value);
        const changesForPreview = {};

        if (name === 'backgroundScaleX' || name === 'backgroundScaleY') {
            if (this.currentConfig.lockBackgroundScaleProportion && this.lockedAspectRatio && this.lockedAspectRatio > 0) {
                let otherName, otherValueInput, newOtherValue;
                if (name === 'backgroundScaleX') {
                    otherName = 'backgroundScaleY';
                    newOtherValue = Math.round(this.currentConfig.backgroundScaleX / this.lockedAspectRatio);
                } else { 
                    otherName = 'backgroundScaleX';
                    newOtherValue = Math.round(this.currentConfig.backgroundScaleY * this.lockedAspectRatio);
                }
                foundry.utils.setProperty(this.currentConfig, otherName, newOtherValue);
                otherValueInput = this.element.find(`[name="config.${otherName}"]`);
                otherValueInput.val(newOtherValue);
                otherValueInput.next('.range-value').text(newOtherValue + 'px');
            }
            changesForPreview.backgroundScaleX = this.currentConfig.backgroundScaleX;
            changesForPreview.backgroundScaleY = this.currentConfig.backgroundScaleY;
        } else {
            changesForPreview[name] = this.currentConfig[name];
        }
        
        if (this.parentBoardDialog && this.parentBoardDialog.rendered) {
            this.parentBoardDialog.updateAppearance(changesForPreview);
        }
    }

    _onInputChange(event) {
        const input = $(event.currentTarget);
        const name = input.attr('name').split('.')[1]; 
        const value = input.is(':checkbox') ? input.is(':checked') : input.val();
        
        foundry.utils.setProperty(this.currentConfig, name, value);
        const changesForPreview = {};
        changesForPreview[name] = value;

        if (name === 'lockBackgroundScaleProportion') {
            if (value === true) { 
                if (this.currentConfig.backgroundScaleX && this.currentConfig.backgroundScaleY && 
                    parseFloat(this.currentConfig.backgroundScaleY) !== 0) {
                    this.lockedAspectRatio = parseFloat(this.currentConfig.backgroundScaleX) / parseFloat(this.currentConfig.backgroundScaleY);
                } else {
                    this.lockedAspectRatio = 1; 
                }
            } else { 
                this.lockedAspectRatio = null;
            }
            changesForPreview.backgroundScaleX = this.currentConfig.backgroundScaleX;
            changesForPreview.backgroundScaleY = this.currentConfig.backgroundScaleY;
        }
        
        if (name === 'backgroundImage') {
            changesForPreview.backgroundScaleX = this.currentConfig.backgroundScaleX;
            changesForPreview.backgroundScaleY = this.currentConfig.backgroundScaleY;
        }

        if (name === 'imageFrameType') {
            // This change requires a full re-render of items, handled by updateAppearance
        }

        if (this.parentBoardDialog && this.parentBoardDialog.rendered) {
            this.parentBoardDialog.updateAppearance(changesForPreview);
        }
    }

    async _updateObject(event, formData) {
        this.submitted = true; // Mark as saved
        if (this.currentConfig.globalItemScale) {
            this.currentConfig.globalItemScale = parseFloat(this.currentConfig.globalItemScale);
        } else {
            this.currentConfig.globalItemScale = 1.0; 
        }
        // imageFrameType is already a string from the select

        await ClueBoardData.updateBoardConfig(this.boardId, this.currentConfig);
        if (this.parentBoardDialog && this.parentBoardDialog.rendered) {
            // Ensure the parent dialog's data is fully updated before its re-render
            this.parentBoardDialog.currentBoardData = ClueBoardData.getBoardData(this.boardId);
            this.parentBoardDialog.render(false); 
        }
    }

    /**
     * Overridden close method to handle reverting changes if not saved.
     */
    async close(options) {
        if (!this.submitted && this.parentBoardDialog && this.parentBoardDialog.rendered) {
            // Revert the parent's in-memory data to the original state that was
            // snapshotted when this config dialog was first opened.
            this.parentBoardDialog.currentBoardData.config = this.originalConfig;
            
            // Call the parent's existing updateAppearance method, passing the entire original config.
            // This method is already designed to handle all visual updates, including resizing the
            // window frame via setPosition, and will correctly reset the dialog to its last saved state.
            this.parentBoardDialog.updateAppearance(this.originalConfig);
        }
        // Proceed with the standard closing procedure.
        return super.close(options);
    }
}