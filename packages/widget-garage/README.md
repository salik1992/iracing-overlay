# Garage cover

Fullscreen cover for the OBS browser source at `/garage`.

* Size the source to the game view.
* A 1920×1080 source is a starting point.
* Other sizes still fill the page.
* The page stays transparent.
* While iRacing reports `IsGarageVisible`, the page covers the source with `assets/cover.png` at full opacity.
* The picture is cropped to the source with `object-fit: cover`.
* The area behind it is black, so a slow image decode still hides the garage.
* Closing the garage screen clears the cover on the next frame.
* The cover does not use the shared idle dim.
* A dropped connection keeps the last visibility at full opacity, so the setup stays covered if the server blinks while the garage is open.
* The fixture leaves the cover hidden.
* `/garage#preview` shows the picture and ignores the live frame.
