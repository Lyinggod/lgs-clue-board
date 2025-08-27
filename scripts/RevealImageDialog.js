import { MODULE_ID, TEMPLATES } from './constants.js';

export class RevealImageDialog extends Application {
    constructor(imageUrl, itemIsBlurredOnBoard, options = {}) {
        super(options);
        this.imageUrl = imageUrl;
        this.itemIsBlurredOnBoard = itemIsBlurredOnBoard; // Used to determine if player sees blur
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: `${MODULE_ID}-reveal-image`,
            template: TEMPLATES.REVEAL_IMAGE_DIALOG,
            popOut: true,
            resizable: false,
            classes: [MODULE_ID, "reveal-image-dialog-app", "dialog-no-header"],
            width: 'auto',
            height: 'auto',
            // title: game.i18n.localize("LGS_CB2.RevealImageDialog.Title"), // Title not shown due to .dialog-no-header
        });
    }

    async getData(options) {
        let applyBlurInDialog = false;
        if (!game.user.isGM) {
            // Player sees blur in dialog IF the item on board is blurred AND the eye icon was shown
            // (which implies icon logic for player should allow it if item blurred but GM wants to show eye icon)
            // However, current request: "Player: Add the same eye icon if the actor-type item is *not* blurred"
            // So, if player sees the icon, itemIsBlurredOnBoard is false.
            applyBlurInDialog = this.itemIsBlurredOnBoard; // This will be false if player clicked the icon based on current rules
        }
        // For GMs, itemIsBlurredOnBoard doesn't dictate blur in this dialog; it's always unblurred for GM.
        // So applyBlurInDialog remains false for GM.

        return {
            imageUrl: this.imageUrl,
            applyBlur: applyBlurInDialog,
            MODULE_ID: MODULE_ID
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        const img = html.find('.revealed-image-content img');
        const self = this;

        img.on('load', function() {
            const originalWidth = this.naturalWidth;
            const originalHeight = this.naturalHeight;
            const maxWidth = 800; // Max content width
            const maxHeight = 800; // Max content height

            let ratio = 1;
            if (originalWidth > 0 && originalHeight > 0 && (originalWidth > maxWidth || originalHeight > maxHeight)) {
                ratio = Math.min(maxWidth / originalWidth, maxHeight / originalHeight);
            }
            
            let newWidth = originalWidth * ratio;
            let newHeight = originalHeight * ratio;
            
            const viewportPadding = 40; // Total padding (e.g., 20px each side)
            const viewportWidth = window.innerWidth - viewportPadding;
            const viewportHeight = window.innerHeight - viewportPadding;

            if (newWidth > viewportWidth) {
                const widthRatio = viewportWidth / newWidth;
                newWidth *= widthRatio;
                newHeight *= widthRatio;
            }
            if (newHeight > viewportHeight) {
                 const heightRatio = viewportHeight / newHeight;
                newWidth *= heightRatio;
                newHeight *= heightRatio;
            }
            
            // Ensure minimum dimensions if image is very small
            newWidth = Math.max(newWidth, 50);
            newHeight = Math.max(newHeight, 50);


            $(this).css({ width: newWidth + 'px', height: newHeight + 'px' });
            self.setPosition({ width: newWidth, height: newHeight });
        }).each(function() {
            if (this.complete || (this.readyState && this.readyState === "complete")) { // Handle cached images
                 $(this).trigger('load');
            }
        });

        this.element.on('click', (event) => {
            event.stopPropagation();
            this.close();
        });
    }
}