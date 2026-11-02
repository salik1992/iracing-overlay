# Standings

Composite timing tower for the OBS browser source at `/standings`. The panel sits at the top left. A 480×640 source matches the layout, and the panel uses the full width. Its height follows the rows. Rows past the source edge are clipped.

The page background stays transparent. The panel is the shared terminal panel at 13px, with 6px 8px of padding.

## Columns

A race session uses position, car number, driver, stops, tyre, position change, and gap. The session type is `Race`, or any type whose text ends with ` race`. Parade laps of a race keep the race columns.

Practice, qualify, warmup, and lone qualify drop the stops and the position change. The last column becomes the best lap.

In a team event the team name replaces every column except position and car number, including the gap. The two layouts swap every 10 seconds. The normal columns show first, and the timer keeps running across frames. An empty team name stays empty. The player tick stays on the player row during the team frame.

## Driver

The name is the first initial, a space, and a three-letter stem, in capitals. Vit Salomon is V SAL. Nyck de Vries is N DVR. Pete van der Kirk is P VDK. Charles Emmerson Winchester the third is C WTT. A single word uses its first three letters. The initial is weight 400 and the trigram is weight 600.

## Window

The top 5 are always in the list. A single class shows at most 30 drivers, with the player centered and 10 cars on each side. When that window meets the top 5, the list fills from P1 up to 30. A field of 31 with the player at the front draws all 31, because a one-car tail takes the same space as a gap line.

Multiclass draws one group per class, ordered by the best overall position in the class. Each class position starts at 1. The player class merges the top 5 with the player ±3 and does not fill out to 30. Every other class shows its top 5. A class of 6 shows all six. A class of 9 shows the top 5 and a gap.

A hole of one car is drawn as that car. A larger hole, and the cars after the window, are a line with the omitted count.

The whole widget caps at 30 driver rows. Headings and omit lines do not count. The player's class stays whole. Other classes lose cars from the last class backward, and a class that loses every car loses its heading. Because a one-car omit is drawn as a car, a cut that would leave a single car omitted removes two so the row count falls.

The sizes live in `src/constants.ts`: `TOP_N` 5, `MAX_ROWS` 30, `PLAYER_RADIUS` 10, `MULTI_RADIUS` 3, `TEAM_MS` 10000.

## Gap

In a race the column is the class interval, three decimals, and the class leader's cell is empty. A car a full lap or more behind the class leader shows `+1L`, `+2L`. Lap distance percent cancels one lap when that car is further through the lap than the leader.

In a race, once the state is racing, the class order is laps completed plus the fraction of the current lap. The position column and the interval follow that order, so a pass shows up where it happens. Parade laps keep iRacing's class position. Under the checkered flag that live order continues until the results leader completes another lap. Cars that have taken the flag then lock to the official result, and cars still running stay in live order. A car towed into its pit stall keeps the progress it had on track. Practice and qualifying keep iRacing's class position, and the gap column stays the best lap.

In every other session the owner of the class best lap shows the clock, such as `1:22.481`. The rest of the class shows the delta of their best lap, such as `+0.214`. A car with no best lap stays on the board, that column is empty, and the row is sorted after every car in the class that has a time. In a race the gap column is empty for that car as well. Ties keep the earlier class position. A position of 0 is left blank.

## Tyre

The letter comes from the server. Hard, medium, soft, intermediate, and wet use the 2026 Pirelli colors: white, yellow, red, green, and blue. Any other letter, including dry, uses the rule chip and the normal glyph. The colors live in this widget. They are signal colors, separate from the Tokyo Night tokens.

The server reads `CarIdxTireCompound`. When `DriverInfo.TireCompounds` names that index, the letter is the first letter of the name. Without a catalog, index 0 is D and index 1 is W. Any other index is blank.

## Class and player

An AI session leaves the class name blank. The heading then uses the short name already published for that class, or the car's short screen name. Multiclass plates and the class separator use the session class color with the hue kept, saturation 0.62, and lightness 0.72. The plate type is `#1a1b26`. A single class uses the rule plate. The separator is a class-colored line across the position column, the class name aligned with the left edge of the plate, and the line continuing to the right edge.

The player mark is the accent tick on that row. The plate stays the class or rule color.

## Position change and stops

The arrow uses the class position on the row. Green and up means places gained. Red and down means places lost. Zero is a muted dash. The server stores iRacing's class position on the first tick whose session state is racing, and the arrow compares the live class position with that stored place, so the baseline is the place at the green. A car that appears later uses the official class position from the first tick that includes it. Attaching after the green flag opens the delta at zero.

Stops count entries into the pit stall after the server has already seen that car. A stall already in progress on the first sight of the car stays uncounted. Both counts reset when the session number changes. The SDK does not publish a pit-stop total or a grid slot.

## Header

The session type is muted. A lap-limited session shows the overall leader's lap over the limit, such as `23/48`. A timed session shows the time remaining, `m:ss`, and `h:mm:ss` from one hour. An unlimited session shows the type alone. The type, the lap or time limit, and the columns follow the current session, so a page opened in practice switches to the race columns when the sim advances.

## Idle and preview

While the server reports `idle`, the panel takes the shared idle opacity and keeps the last rows.

`/standings#preview` paints a generated multiclass race through this layout and ignores the live frame. `/standings#team` is that race on the team-name frame. The live page has no hash. A screenshot uses a query as well as the hash, because a hash change on an open page does not reload it.
