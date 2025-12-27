// scripts/ClueBoardManagerDialog.js
import { MODULE_ID, TEMPLATES } from './constants.js'; // Path updated
import { ClueBoardData } from './ClueBoardData.js'; // Path updated
import { ClueBoardDialog } from './ClueBoardDialog.js'; // Path updated

export class ClueBoardManagerDialog extends Application {
    constructor(options = {}) {
        super(options);
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: `${MODULE_ID}-manager`,
            title: game.i18n.localize('LGS_CB2.ClueBoardManagerTitle'),
            template: TEMPLATES.CLUE_BOARD_MANAGER,
            width: 500,
            height: 'auto',
            resizable: true,
            classes: [MODULE_ID, "clue-board-manager-dialog"],
        });
    }

    async getData(options) {
        try {
            // This line calls the ClueBoardData.allBoardsData getter
            const allBoardsData = ClueBoardData.allBoardsData; 
            
            // Add validation and filtering to prevent undefined names
            const boards = Object.values(allBoardsData)
                .filter(b => b && typeof b === 'object' && b.id && b.name) // Filter out invalid entries
                .map(b => ({
                    id: b.id,
                    name: b.name || 'Unnamed Board', // Fallback for missing names
                    isHidden: b.isHidden || false // Fallback for missing isHidden
                }))
                .sort((a, b) => {
                    // Safe comparison with fallbacks
                    const nameA = (a.name || '').toString();
                    const nameB = (b.name || '').toString();
                    return nameA.localeCompare(nameB);
                });

            console.log(`${MODULE_ID} | Manager getData: Found ${boards.length} valid boards`);
            
            return {
                boards: boards,
                isGM: game.user.isGM
            };
        } catch (error) {
            console.error(`${MODULE_ID} | Error in ClueBoardManagerDialog.getData():`, error);
            console.error(`${MODULE_ID} | allBoardsData:`, ClueBoardData.allBoardsData);
            
            // Return safe fallback data
            return {
                boards: [],
                isGM: game.user.isGM
            };
        }
    }

    activateListeners(html) {
        super.activateListeners(html);
        const isGM = game.user.isGM;

        // --- MODIFICATION START ---
        // Make board entries draggable to the hotbar to create a macro
        html.find('.board-entry[data-board-id]').each((i, el) => {
            el.setAttribute('draggable', true);
            el.addEventListener('dragstart', this._onDragStart.bind(this));
        });
        // --- MODIFICATION END ---

        html.find('.add-board').on('click', this._onAddBoard.bind(this));
        
        html.find('.board-entry .board-name, .board-entry .view-board').on('click', ev => {
            const boardId = $(ev.currentTarget).closest('.board-entry').data('boardId');
            const boardData = ClueBoardData.getBoardData(boardId);
            if (boardData && (!boardData.isHidden || isGM)) {
                new ClueBoardDialog(boardId).render(true);
            } else if (boardData && boardData.isHidden && !isGM) {
                ui.notifications.warn("This clue board is currently hidden by the GM.");
            }
        });

        if (isGM) {
            html.find('.rename-board').on('click', this._onRenameBoard.bind(this));
            html.find('.delete-board').on('click', this._onDeleteBoard.bind(this));
            html.find('.toggle-hide-board').on('click', this._onToggleHideBoard.bind(this));
        }
    }

    async _onAddBoard(event) {
        event.preventDefault();
        const name = await Dialog.prompt({
            title: game.i18n.localize('LGS_CB2.AddClueBoard'),
            content: `<label>${game.i18n.localize('LGS_CB2.ClueBoardName')}: <input type="text" name="boardName" autofocus/></label>`,
            callback: (html) => html.find('input[name="boardName"]').val(),
            rejectClose: false,
        });

        if (name) {
            await ClueBoardData.addBoard(name);
            this.render(true);
        }
    }

    async _onRenameBoard(event) {
        event.preventDefault();
        const boardId = $(event.currentTarget).closest('.board-entry').data('boardId');
        const boardData = ClueBoardData.getBoardData(boardId);
        if (!boardData) return;

        const currentName = boardData.name || 'Unnamed Board';
        const newName = await Dialog.prompt({
            title: game.i18n.localize('LGS_CB2.Rename') + ` "${currentName}"`,
            content: `<label>${game.i18n.localize('LGS_CB2.ClueBoardName')}: <input type="text" name="boardName" value="${currentName}" autofocus/></label>`,
            callback: (html) => html.find('input[name="boardName"]').val(),
            rejectClose: false,
        });

        if (newName && newName !== currentName) {
            await ClueBoardData.updateBoardMetadata(boardId, { name: newName });
            this.render(true);
        }
    }

    async _onDeleteBoard(event) {
        event.preventDefault();
        const boardId = $(event.currentTarget).closest('.board-entry').data('boardId');
        const boardData = ClueBoardData.getBoardData(boardId);
        if (!boardData) return;

        const boardName = boardData.name || 'Unnamed Board';
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize('LGS_CB2.ConfirmDeleteBoardTitle'),
            content: `<p>${game.i18n.format('LGS_CB2.ConfirmDeleteBoardContent', {name: boardName})}</p>`,
            yes: () => true,
            no: () => false,
            defaultYes: false
        });

        if (confirmed) {
            await ClueBoardData.deleteBoard(boardId);
            Object.values(ui.windows).forEach(app => {
                if (app instanceof ClueBoardDialog && app.boardId === boardId) {
                    app.close();
                }
            });
            this.render(true);
        }
    }

    async _onToggleHideBoard(event) {
        event.preventDefault();
        const boardId = $(event.currentTarget).closest('.board-entry').data('boardId');
        const boardData = ClueBoardData.getBoardData(boardId);
        if (!boardData) return;

        await ClueBoardData.updateBoardMetadata(boardId, { isHidden: !boardData.isHidden });
        this.render(true);
    }

    /**
     * --- MODIFICATION START ---
     * Handles the drag start event for a board entry to create a macro.
     * @param {DragEvent} event The drag event.
     * --- MODIFICATION END ---
     */
    _onDragStart(event) {
        const boardId = event.currentTarget.dataset.boardId;
        const boardData = ClueBoardData.getBoardData(boardId);
        if (!boardData) return;

        const dragData = {
            type: "Macro",
            data: {
                name: `Clue Board: ${boardData.name}`,
                type: "script",
                img: "icons/sundries/documents/document-sealed-signatures-red.webp",
                command: `game.modules.get('${MODULE_ID}').api.openBoard('${boardData.id}');`
            }
        };
        event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    }
}