export const MODULE_ID = 'lgs-clue-board-v2';
export const MODULE_NAME = 'Lyinggods Clue Board v2';

export const FLAGS = {
    CLUEBOARDS: 'clueBoardsData'
};

export const SOCKET_EVENT = `module.${MODULE_ID}`;

export const TEMPLATES = {
    CLUE_BOARD_MANAGER: `modules/${MODULE_ID}/templates/clue-board-manager-dialog.html`,
    CLUE_BOARD_DIALOG: `modules/${MODULE_ID}/templates/clue-board-dialog.html`,
    CLUE_BOARD_CONFIG: `modules/${MODULE_ID}/templates/clue-board-config-dialog.html`,
    ADD_NOTE_DIALOG: `modules/${MODULE_ID}/templates/add-note-dialog.html`,
    CLUE_ITEM: `modules/${MODULE_ID}/templates/clue-item.html`,
    CLUE_NOTE_ITEM: `modules/${MODULE_ID}/templates/clue-note-item.html`,
    CLUE_ITEM_CONFIG_DIALOG: `modules/${MODULE_ID}/templates/clue-item-config-dialog.html`,
    ADD_CLUE_DIALOG: `modules/${MODULE_ID}/templates/add-clue-dialog.html`,
    ADD_CLUE_HELP_DIALOG: `modules/${MODULE_ID}/templates/add-clue-help-dialog.html`,
    CLUE_NODE_CONFIG_DIALOG: `modules/${MODULE_ID}/templates/clue-node-config-dialog.html`,
    REVEAL_IMAGE_DIALOG: `modules/${MODULE_ID}/templates/reveal-image-dialog.html` // New Template
};

export const DEFAULT_ACTOR_ITEM_WIDTH = 576*.3;
export const DEFAULT_ACTOR_ITEM_HEIGHT = 736*.3;
export const DEFAULT_NOTE_WIDTH = 200;
export const DEFAULT_NOTE_HEIGHT = 150;
export const NODE_RADIUS = 10; // This is the radius, so diameter is 20px
export const DEFAULT_NODE_WIDTH = NODE_RADIUS * 2;
export const DEFAULT_NODE_HEIGHT = NODE_RADIUS * 2;

export const MYSTERY_MAN_IMAGE = `modules/${MODULE_ID}/assets/mystery-man.webp`;
export const PLACEHOLDER_IMAGE_PATH = `modules/${MODULE_ID}/assets/placeholder.webp`;