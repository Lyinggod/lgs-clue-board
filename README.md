Creates a clue board style note and picture repository for Foundry Vtt.

**Uses:**
- Tracking Clues in an invesigation
- Track factions and alliances
- Show organizational structures

<img src="https://github.com/Lyinggod/lgs-clue-board/blob/main/images/clue-board.webp" width="500"/>

Items placed on the clue board can be seen by everyone and may be moved by everyone. Options are available to lock items in place.

If a player has an item selected, a circle with their player color will appear on the top of the clue board.

## Usage:
A _Clue Board_ button is added to the Actor Tab which shows the Clue Board selector dialog

Use the Clue Board selector dialog to add, remove, and hide clue boards from players.

<img src="https://github.com/Lyinggod/lgs-clue-board/blob/main/images/Clue_Board_Selector.webp" width="500"/>

**ICONS**
- <img src="https://github.com/Lyinggod/lgs-clue-board/blob/main/images/edit_name_icon.webp"/> - Edit name of clue board
- <img src="https://github.com/Lyinggod/lgs-clue-board/blob/main/images/hide_eye_icon.webp"/> - Hide a clue board from the players
- <img src="https://github.com/Lyinggod/lgs-clue-board/blob/main/images/trashcan_icon.webp"/> - delete clue board

# Adding Actors and Notes
Right click on the background of the clue board to see the "add item" menu

<img src="https://github.com/Lyinggod/lgs-clue-board/blob/main/images/background_click_options.webp"/>

- _Add Note_ - Shows a dialog to allow players to add note text and GMS to enter secret text
- _Add Hidden Note_ - Functions as _Add Note_ but defaults the note to be being hidden by players.
- _Add Item to Board_ - Shows dialog with all available actors in the sidebard, plus a "Node". Nodes are meant for organizing lines (See below).

<img src="https://github.com/Lyinggod/lgs-clue-board/blob/main/images/add_item_to_board.webp" width="400"/>

- _Use Actor Name For Clue_ - if unchecked, actors droped from _Add Item to Board_ have default text of "Clue #" (# is an incrementing number).
- _Hide From Player_ - hide the dropped actor image from the player.
- _Clue_ icon -  drag onto clue board to create a mystery person image.
- _Node_ - Drag to clue board to create a small circle for organization of lines 

# Clue Board Item Options
The right clicking on items in the clue board will show an options menu.

<img src="https://github.com/Lyinggod/lgs-clue-board/blob/main/images/right_click_options.webp"/>

- <img src="https://github.com/Lyinggod/lgs-clue-board/blob/main/images/link_icon.webp"/> - create a line between two clue board items. After selecting this option, click on the clue to connect the line to.
- <img src="https://github.com/Lyinggod/lgs-clue-board/blob/main/images/lock_icon.webp"/> - Lock the item so it cannot be moved by players (gm only)
- <img src="https://github.com/Lyinggod/lgs-clue-board/blob/main/images/gear_icon.webp"/> - Show edit menu for items.
- <img src="https://github.com/Lyinggod/lgs-clue-board/blob/main/images/trashcan_icon.webp"/> - delete the item. Players may only delete items they created. Deleting the item deletes all connected lines.
- <img src="https://github.com/Lyinggod/lgs-clue-board/blob/main/images/hide_eye_icon.webp"/> - Shows a larger item image to the player who clicked on it.

# Item Edit Menu
<img src="https://github.com/Lyinggod/lgs-clue-board/blob/main/images/item_edit_dialog.webp" width="400"/>

**Note** - Depending on the clue, not all options will be available.

- **Clue Name** - Name shown to players
- **Lock Name** - Prevent Players from changing name
- **GM Notes** - Notes only visible to the GM. Appears at the top of the clue board when item is hovered over. Denoted on the clue with a yellow icon (visible only to GM).
- **Image Path** - Selects an image for the clue
- **Item Image Frame** - Select the appearance of the clue; picture, circle, or square. This defaults to the assigned frame for the clue board.
- **Scale** - Changes the size of the image within the frame.
- **Offset X & Y**: change the postion of the image in the frame.
- **Blur Image** - Blurs the image
- **Status Flags** - To show status of the clue
- **Visibility** - Hide the clue from the player
- **Clue Connections** - Shows lines connected to this clue. Allows the deleting of lines to this clue. Shows connected clues by name or initial note text.

# CONFIGURE CLUE BOARD
<img src="https://github.com/Lyinggod/lgs-clue-board/blob/main/images/clue-board-config.webp" width="400"/>

- **Board Dimensions** - Changes the size of the clue board.
- **Background Image** - Set the background image of the clue board.
- **Background Scale** - Change the size of the background image of the clue board.
- **Global Item Scale** - Change the size of items on the clue board.
- **Image Frame Type** - Set the default frame type for the clue board
- **Prevent Player Interaction** - Used if clue board is entirely for informational purposes

# Installation
Install through Foundry or copy and paste the following manifest URL into the module installation dialog in Foundry VTT

```javascript
https://github.com/Lyinggod/lgs-clueoboard/releases/latest/download/module.json
```
