import { MODULE_ID, MODULE_NAME, TEMPLATES, FLAGS } from './constants.js';
import { ClueBoardManagerDialog } from './ClueBoardManagerDialog.js';
import { socketController } from './SocketController.js';
import { ClueBoardDialog } from './ClueBoardDialog.js';
import { ClueBoardData } from './ClueBoardData.js';
import './ClueBoardConfigDialog.js';
import { ClueItemConfigDialog } from './ClueItemConfigDialog.js';
import { AddClueDialog } from './AddClueDialog.js'; 
import { ClueNodeConfigDialog } from './ClueNodeConfigDialog.js'; 
import { RevealImageDialog } from './RevealImageDialog.js'; // Import new dialog


Hooks.once('init', () => {
    console.log(`${MODULE_ID} | Initializing ${MODULE_NAME} - INIT Hook Start`);

    try {
        game.settings.register(MODULE_ID, FLAGS.CLUEBOARDS, {
            name: "Clue Boards Data Storage (Fallback)",
            hint: "Internal data for Lyinggods Clue Board v2. Do not change manually.",
            scope: "world",
            config: false,
            default: {},
            type: Object
        });
        console.log(`${MODULE_ID} | Setting "${MODULE_ID}.${FLAGS.CLUEBOARDS}" registered successfully.`);
    } catch (e) {
        console.error(`${MODULE_ID} | FAILED to register setting "${MODULE_ID}.${FLAGS.CLUEBOARDS}":`, e);
    }

    try {
        loadTemplates(Object.values(TEMPLATES));
        console.log(`${MODULE_ID} | Templates loaded.`);
    } catch (e) {
        console.error(`${MODULE_ID} | FAILED to load templates:`, e);
    }


    game.modules.get(MODULE_ID).api = {
        ClueBoardManagerDialog,
        RevealImageDialog, // Expose if needed for macros, etc.
        openManager: () => new ClueBoardManagerDialog().render(true),
        /**
         * --- MODIFICATION START ---
         * API function to open a specific Clue Board by its ID.
         * Used by the hotbar macro.
         * @param {string} boardId The ID of the board to open.
         * --- MODIFICATION END ---
         */
        openBoard: (boardId) => {
            const boardData = ClueBoardData.getBoardData(boardId);
            if (!boardData) {
                return ui.notifications.warn(`Clue board with ID "${boardId}" no longer exists.`);
            }
            if (boardData.isHidden && !game.user.isGM) {
                return ui.notifications.warn("This clue board is currently hidden by the GM.");
            }
            new ClueBoardDialog(boardId).render(true);
        }
    };

    console.log(`${MODULE_ID} | INIT Hook End`);
});

Hooks.once('ready', () => {
    console.log(`${MODULE_ID} | READY Hook Start`);
    try {
        socketController.initialize();
        console.log(`${MODULE_ID} | SocketController initialized.`);
    } catch (e) {
        console.error(`${MODULE_ID} | FAILED to initialize SocketController:`, e);
    }
    console.log(`${MODULE_ID} | ${MODULE_NAME} Ready`);
    console.log(`${MODULE_ID} | READY Hook End`);
});

Hooks.on('renderActorDirectory', (app, html, data) => {
    const buttonText = game.i18n.localize('LGS_CB2.ClueBoardsButton');
    const clueBoardButton = $(`<button class="lgs-clue-board-open-manager"><i class="fas fa-chalkboard-teacher"></i> ${buttonText}</button>`);
    
    const headerActions = html.find('.header-actions, .directory-header .action-buttons');
     if (headerActions.length) {
        headerActions.append(clueBoardButton);
    } else {
        const directoryControls = html.find('.directory-header .header-search').parent();
        if (directoryControls.length) {
            directoryControls.append(clueBoardButton);
        } else {
             html.find('.directory-header').append(clueBoardButton);
        }
    }

    clueBoardButton.on('click', (event) => {
        event.preventDefault();
        new ClueBoardManagerDialog().render(true);
    });
});