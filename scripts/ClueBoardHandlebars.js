// scripts/ClueBoardHandlebars.js
import { MODULE_ID, TEMPLATES, DEFAULT_NODE_WIDTH, NODE_RADIUS } from './constants.js';

/**
 * Renders a single clue item based on its type.
 * This helper is registered on init and used within the clue-board-dialog.html template.
 */
Handlebars.registerHelper('renderClueItem', function(item, boardConfig) {
    if (!game.user.isGM && item.isHiddenFromPlayer) {
        return ''; 
    }

    let itemHtml = '';
    const hasGMNotes = game.user.isGM && 
                       ((item.type === 'note' && item.gmText && item.gmText.trim() !== "") ||
                        ((item.type === 'actor' || item.isCustomImage || item.isPlaceholder) && item.gmNotes && item.gmNotes.trim() !== "") || 
                        (item.type === 'node' && item.gmNotes && item.gmNotes.trim() !== "")); 

    const configForThisItemRender = foundry.utils.deepClone(boardConfig || {});
    if (typeof configForThisItemRender.globalItemScale === 'undefined') {
        configForThisItemRender.globalItemScale = 1.0;
    }
    if (typeof configForThisItemRender.imageFrameType === 'undefined') {
        configForThisItemRender.imageFrameType = "photo";
    }

    let effectiveItemFrameType = configForThisItemRender.imageFrameType;
    if (item.type === 'actor' || item.isCustomImage || item.isPlaceholder) {
        if (item.imageFrameType && item.imageFrameType !== 'board_default') {
            effectiveItemFrameType = item.imageFrameType;
        }
    }
    configForThisItemRender.imageFrameType = effectiveItemFrameType;

    const commonData = { 
        item: item, 
        boardConfig: configForThisItemRender, 
        MODULE_ID: MODULE_ID, 
        NODE_RADIUS: NODE_RADIUS, 
        isGM: game.user.isGM,
        hasGMNotes: hasGMNotes,
        isGMHidden: game.user.isGM && item.isHiddenFromPlayer 
    }; 
    
    try {
        if (item.type === 'actor' || item.isCustomImage || item.isPlaceholder) { 
            if (Handlebars.partials[TEMPLATES.CLUE_ITEM]) {
                itemHtml = Handlebars.partials[TEMPLATES.CLUE_ITEM](commonData);
            } else {
                itemHtml = `<div class="clue-item error-item" style="z-index:2;">Error: Actor/Image Template Missing</div>`;
            }
        } else if (item.type === 'note') {
            if (Handlebars.partials[TEMPLATES.CLUE_NOTE_ITEM]) {
                itemHtml = Handlebars.partials[TEMPLATES.CLUE_NOTE_ITEM](commonData);
            } else {
                itemHtml = `<div class="clue-item error-item" style="z-index:2;">Error: Note Template Missing</div>`;
            }
        } else if (item.type === 'node') {
            const itemWidth = item.width || DEFAULT_NODE_WIDTH;
            const itemHeight = item.height || DEFAULT_NODE_WIDTH;
            const nodeLeft = item.x - (itemWidth / 2); 
            const nodeTop = item.y - (itemHeight / 2); 
            const gmHiddenClass = (commonData.isGMHidden) ? 'gm-hidden-item' : '';

            const nodeTemplateString = `
                <div class="clue-item node-item {{#if item.isLocked}}locked{{/if}} ${gmHiddenClass}" 
                     data-item-id="{{item.id}}"
                     data-circle-counter="{{item.circleCounter}}" 
                     style="left: ${nodeLeft}px; top: ${nodeTop}px; 
                            width: ${itemWidth}px; height: ${itemHeight}px; 
                            background-color: white; border: 2px solid black; border-radius: 50%; 
                            position:absolute; z-index: 2;
                            display: flex; align-items: center; justify-content: center; 
                            transform: scale({{boardConfig.globalItemScale}}); transform-origin: center center;">
                    <div class="item-context-menu-icons" style="position: absolute; left: -30px; top: 0px; display: none; flex-direction: column; gap: 5px; z-index: 10;"></div>
                 </div>`;
            const compiledNodeTemplate = Handlebars.compile(nodeTemplateString);
            itemHtml = compiledNodeTemplate(commonData); 
        }
    } catch (e) {
        itemHtml = `<div class="clue-item error-item" data-item-id="${item.id}" style="left: ${item.x||0}px; top: ${item.y||0}px; width:100px; height:50px; border:2px solid red; background:pink;">Error rendering item ${item.id}</div>`;
    }
    
    return new Handlebars.SafeString(itemHtml);
});

if (!Handlebars.helpers.subtract) {
    Handlebars.registerHelper('subtract', (a, b) => Number(a) - Number(b));
}

if (!Handlebars.helpers.multiply) {
    Handlebars.registerHelper('multiply', (a, b) => {
        const numA = Number(a);
        const numB = Number(b);
        if (isNaN(numA) || isNaN(numB)) return ''; 
        return Math.round(numA * numB); 
    });
}

// --- MODIFICATION START ---
if (!Handlebars.helpers.divide) {
    Handlebars.registerHelper('divide', (a, b) => (Number(b) !== 0 ? Number(a) / Number(b) : 0));
}
// --- MODIFICATION END ---