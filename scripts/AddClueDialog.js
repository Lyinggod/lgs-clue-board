// scripts/AddClueDialog.js
import { MODULE_ID, TEMPLATES, MYSTERY_MAN_IMAGE, PLACEHOLDER_IMAGE_PATH } from './constants.js';

export class AddClueDialog extends Application {
    constructor(boardId, position, clueBoardApp, options = {}) {
        super(options);
        this.boardId = boardId;
        this.position = position;
        this.clueBoardApp = clueBoardApp;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: `${MODULE_ID}-add-clue`,
            title: game.i18n.localize('LGS_CB2.AddClueDialog.Title'),
            template: TEMPLATES.ADD_CLUE_DIALOG,
            width: 600, 
            height: 'auto',
            classes: [MODULE_ID, "add-clue-dialog-app"],
            resizable: true,
        });
    }

    async _render(force = false, options = {}) {
        await super._render(force, options);
        
        if (this.element && this.element.length) {
            this.element.css({
                'width': '600px',
                'min-width': '600px'
            });
            
            this.setPosition({
                width: 600,
                height: this.position.height || 'auto'
            });
        }
    }

    async getData(options) {
        const isGM = game.user.isGM;
        const actors = isGM ? game.actors.contents.map(actor => ({
            id: actor.id,
            name: actor.name,
            img: actor.img || CONST.DEFAULT_TOKEN
        })) : [];

        return {
            MODULE_ID: MODULE_ID,
            availableActors: actors,
            mysteryManImage: MYSTERY_MAN_IMAGE,
            placeholderImagePath: PLACEHOLDER_IMAGE_PATH,
            isGM: isGM,
            useActorName: false, 
            hideAddedItemFromPlayer: false // Default for new checkbox
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        const self = this;

        html.find('.dialog-help-button').on('click', async (event) => {
            event.preventDefault();
            const helpContent = await renderTemplate(TEMPLATES.ADD_CLUE_HELP_DIALOG, {});
            new Dialog({
                title: game.i18n.localize("LGS_CB2.AddClueDialog.Help.Title"),
                content: helpContent,
                buttons: {
                    ok: {
                        icon: '<i class="fas fa-check"></i>',
                        label: game.i18n.localize("LGS_CB2.Close"),
                    }
                },
                default: "ok",
                render: dlgHtml => {
                    $(dlgHtml).closest('.dialog').css({ 'width': '550px', 'max-height': '80vh', 'overflow-y': 'auto' });
                }
            }).render(true);
        });


        html.find('.draggable-clue').each((i, el) => {
            const draggableElement = el;
            draggableElement.setAttribute('draggable', true);

            const dragStartHandler = (event) => {
                const clueType = draggableElement.dataset.clueType;
                const data = {
                    type: "CluePaletteItem",
                    clueType: clueType, 
                    boardId: self.boardId,
                };
                if (game.user.isGM) { // Only GMs have these checkboxes
                    data.hideAddedItemFromPlayer = html.find(`#${MODULE_ID}-hideAddedItemFromPlayer`).is(':checked');
                    if (clueType === 'actor') {
                        data.actorId = draggableElement.dataset.actorId;
                        data.useActorName = html.find(`#${MODULE_ID}-useActorName`).is(':checked');
                    }
                }
                event.dataTransfer.setData('text/plain', JSON.stringify(data));
            };

            draggableElement.addEventListener('dragstart', dragStartHandler);

            const img = draggableElement.querySelector('img.palette-item-icon');
            if (img) {
                img.setAttribute('draggable', true);
                img.addEventListener('dragstart', (event) => {
                    dragStartHandler(event); 
                    event.stopPropagation(); 
                });
                img.addEventListener('drag', (e) => e.preventDefault());
            }
            const svgElement = draggableElement.querySelector('svg');
            if (svgElement) {
                svgElement.setAttribute('draggable', true);
                svgElement.addEventListener('dragstart', (event) => {
                    dragStartHandler(event);
                    event.stopPropagation();
                });
                svgElement.addEventListener('drag', (e) => e.preventDefault());
            }
        });
    }
}