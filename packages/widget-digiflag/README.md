# Digiflag

Cove 16 flag matrix for the OBS browser source at `/digiflag`.

* The source is square.
* A 288×288 source matches the study.
* Other sizes keep the same corner.
* The square sits in the top-right of the viewport.
* The page has no panel.
* The server sends decoded `SessionFlags` names at 10 Hz.
* During the pace lap it withholds `green` and `greenHeld` until `startGo`.
* One lamp is drawn.
* Driver warnings win over the race-state lamps.

The winner, from first to last:

1. disqualify
2. black
3. repair
4. furled
5. red
6. checkered
7. caution waving
8. caution
9. yellow waving
10. random waving
11. yellow
12. debris
13. white
14. blue
15. crossed
16. green held
17. start go
18. green

These names leave the matrix clear:

* `serviceable`. The SDK describes the service bit as not a flag.
* `dqScoringInvalid`, a scoring state.
* `startHidden`, `startReady`, and `startSet`, the start lights.
* `fiveToGo`, `tenToGo`, and `oneLapToGreen`, the lap-count boards.

The green lamp:

* Stays off while the start lights are at ready or set.
* A held green with no green bit stays off.
* Lights on start go.
* Lights on the green bit once the pace lap is over and those lights have moved on.

Every lamp fades in and fades out over 200 ms when it appears or gives way to another lamp.

Debris and checkered swap colors:

* 800 ms held.
* Then a 200 ms crossfade.
* Then the other color on the same cadence.
* Debris trades yellow and red by column.
* Checkered trades white and black by cell.

These lamps blink, 500 ms lit and 500 ms dark:

* blue
* yellow waving
* caution waving
* random waving
* furled
* disqualify

The rest hold still.

* Green, green held, and start go are green.
* Yellow and caution are yellow.
* Red is red.
* White is white.
* Black, furled, and disqualify are black.
* Repair is an orange ball on a black field.
* Crossed is a white field with a black slash through the corner.
* The lamp colors are signal colors, written in `src/leds.ts`.
* They are not Tokyo Night tokens, for the same reason a class color stays the session hex.
* While the server reports `idle`, the matrix is fully hidden and keeps the last lamp.
* A hash such as `/digiflag#debris` pins that lamp and ignores the live frame, so each flag can be checked on its own.
* The live page uses no hash.
