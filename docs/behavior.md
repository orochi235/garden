# App Behavior

Running list of intended application behaviors.

## Canvas

- When dragging an item from the object palette, once the cursor is over the canvas, display a ghosted full-size version of the object underneath the cursor to help the user place it
- While the pan tool is selected, left-click drag on the canvas should pan it
- Right-click drag always pans regardless of tool
- While selecting, if you hold down alt and drag an object, it should clone it (snaps to grid)

## Cursor

- In select mode, show an arrow cursor while not over a valid target, and a pointer over a valid target
- Clicking an object makes it the current selection; support multiple selections

## Tools

- Only show the selection outline for the object palette while in draw mode
- When draw mode is active with a selected palette item, clicking and dragging draws that object on the canvas

## Labels

- Only show object labels while the object is selected
- Labels appear below the object in smaller text

## Scale Indicator

- A floating widget in the bottom-left corner draws a darker square over the closest fully visible grid square to the corner, with a caption showing the current scale
- The scale widget snaps to the grid
- While the canvas is being panned or zoomed, fade the scale widget out; fade it back in 0.5s after movement stops

## Layer Selector

- Text label moves to follow the active plate; plates stay relatively stationary
- Default theme is "Live" (time-based)

## Sidebar

- Right-hand panel section titles have less space to the left of the toggle slider and a bit more to the right
