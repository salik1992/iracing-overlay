# Standings

Composite timing tower for the OBS browser source at `/standings`.

- The panel sits at the top left.
- The clipping frame is 640px tall.
- Rows past that edge are clipped.
- The page background stays transparent.
- The type is 13px, on the shared panel at 88% fill, with 6px 8px of padding.
- Each class is only as wide as the columns on screen.
- An empty column is dropped, and that class gets narrower.
- Classes do not share one width.

## Columns

Position, the car number, and the driver stay on every row.

A race alternates the rest:

- The gap shows for 20 seconds.
- Stops, the tyre, and the place change then show for 7 seconds.
- The gap shows first.
- The timer keeps running across frames.
- The session type is `Race`, or any type whose text ends with ` race`.
- Parade laps of a race keep that alternation.

Practice, qualify, warmup, and lone qualify do not alternate.

- They drop the stops and the place change.
- The tyre stays up.
- The last column is the best lap.

The best lap, its delta, and the race gap are the number color. Stops are the normal text color. Position is the number color.

In a team event the driver frame and the team frame still swap every 10 seconds.

- The normal columns show first.
- The timer keeps running across frames.
- On the team frame, the team name takes the driver column and the gap column.
- It does not grow past those two.
- A longer name ends in an ellipsis.
- Stops, the tyre, and the place change stay hidden on that frame.
- An empty team name stays empty.

## Driver

The name is the first initial, a space, and a three-letter stem, in capitals.

- Vit Salomon is V SAL.
- Nyck de Vries is N DVR.
- Pete van der Kirk is P VDK.
- Charles Emmerson Winchester the third is C WTT.
- A single word uses its first three letters.
- The initial is weight 400.
- The trigram is weight 600.

## Window

- Other classes show the top 5.
- A class with fewer than 5 shows every car.
- A class of 6 shows all six.
- A class of 7 shows the top 5 and a gap, because a hole of one car is drawn as that car.
- The player's class uses the same window in a single-class field and in a multiclass field.
- It always shows its top 5.

The rows left for the cars around the player are

`(31 - heading - 5 - 1) / 2`

when the player is outside the top 5. The heading is 1 when more than one class is on the board, and 0 for a single class. Other classes do not reduce this window.

- Half of that, rounded up, is the number of cars directly above the player.
- Half, rounded down, is the number directly below.
- When the player is already inside the top 5, the formula does not subtract the player again, because that row is one of the five.
- Cars above the player that are already in the top 5, or that would sit before P1, are not drawn twice. Those spare rows move below the player.
- Cars that would sit past the last car in the class move above the player.
- A hole of one car is still drawn as that car.
- A larger hole is a line with the omitted count.
- A 60-car class with the player in P9 draws P1–P31 and a gap of 29.
- The same class with the player in P53 draws P1–P5, a gap of 29, and P35–P60.
- A 28-car class with the player in P1 draws all 28, because the one car past the window is drawn as a car.
- The class heading counts as one of the 31 rows. Omit lines do not.
- Other classes still show their top 5, and that does not shrink the player class.
- Multiclass draws one group per class, ordered by the best overall position in the class.
- Each class position starts at 1.

The sizes live in `src/constants.ts`:

- `TOP_N` 5
- `OTHER_TOP` 5
- `MAX_ROWS` 31
- `HEADING_ROWS` 1
- `TEAM_MS` 10000
- `GAP_MS` 20000
- `DETAIL_MS` 7000

Pit and garage rows:

- A car on pit road, stopped in its stall, or sitting in the garage is drawn at 0.7 opacity.
- The garage is track surface NotInWorld.
- A car off the racing surface keeps full opacity.

## Gap

In a race the column is the class interval, three decimals, and the class leader's cell is empty.

- The interval is the session-clock gap at the last sector line the car behind crossed, against the class car that was ahead on that same lap.
- It holds until the next line.
- A pass clears it until each car completes a sector behind its new car ahead.
- Sector lines come from `SplitTimeInfo`, and the start/finish line is one of them.
- A lap-percent jump that skips part of the lap, such as a tow, does not count.
- Until both cars have crossed that line while the server is watching, the cell is empty.
- A car a full lap or more behind the class leader shows `+1L`, `+2L`.
- Lap distance percent cancels one lap when that car is further through the lap than the leader.

Race order:

- Once the state is racing, the class order is laps completed plus the fraction of the current lap.
- The position column follows that order, so a pass shows up where it happens.
- The interval stays the last sector gap and clears when the class car ahead changes.
- An invalidated lap leaves no best time, and that car keeps this place.
- Before the green, while the race is getting in the car, warming up, or on parade laps, the order is the qualifying grid from `QualifyResultsInfo` when that list has cars.
- Those places are 0-based in the YAML, and the row shows them starting at 1.
- A car left off the grid sorts after it.
- A posted lap does not move anyone.
- With no qualifying result the row keeps the class position iRacing publishes, which is often 0, so the tower follows entry order.
- Under the checkered flag that live order continues until the results leader completes another lap.
- Cars that have taken the flag then lock to the official result.
- Cars still running stay in live order.
- A car towed into its pit stall keeps the progress it had on track.
- A race uses the live best lap only.

Practice and qualifying:

- The class is ordered by the posted best lap, and the gap column is that lap.
- That time is `ResultsPositions.FastestTime`, the lap iRacing's standings count.
- A live best the standings have not accepted, such as an off-track or a slowdown, is not shown.
- A lap already in the results stays on the tower when the server attaches later.
- It also stays when the driver gets out of the car.

In every other session:

- The owner of the class best lap shows the clock, such as `1:22.481`.
- The rest of the class shows the delta of their best lap, such as `+0.214`.
- A car with no best lap stays on the board.
- That column is empty.
- The row is sorted after every car in the class that has a time.
- In a race the interval shows once that sector line has been seen for both cars.
- A pass clears the cell until the next line.
- Ties keep the earlier class position.
- A position of 0 is left blank.

## Tyre

- The letter comes from the server.
- Hard is white.
- Medium is yellow.
- Soft is red.
- Intermediate is green.
- Wet is blue.
- Those are the 2026 Pirelli colors.
- Any other letter, including dry, uses the rule chip and the normal glyph.
- The colors live in this widget.
- They are signal colors, separate from the Tokyo Night tokens.
- The server reads `CarIdxTireCompound`.
- When `DriverInfo.TireCompounds` names that index, the letter is the first letter of the name.
- Without a catalog, index 0 is D and index 1 is W.
- Any other index is blank.

## Class and player

- An AI session leaves the class name blank.
- The heading then uses the short name already published for that class, or the car's short screen name.
- Multiclass plates and the class separator use the session class color with the hue kept, saturation 0.62, and lightness 0.72.
- The plate type is `#1a1b26`.
- A single class uses the rule plate.
- The separator is a class-colored line across the position column.
- The class name aligns with the left edge of the plate.
- The line continues to the right edge.
- The plate stays the class or rule color.

## Position change and stops

- The arrow uses the class position on the row.
- Green and up means places gained.
- Red and down means places lost.
- Zero is a muted dash.
- The server stores iRacing's class position on the first tick whose session state is racing.
- The arrow compares the live class position with that stored place, so the baseline is the place at the green.
- A car that appears later uses the official class position from the first tick that includes it.
- Attaching after the green flag opens the delta at zero.
- Stops count entries into the pit stall after the server has already seen that car.
- A stall already in progress on the first sight of the car stays uncounted.
- Both counts reset when the session number changes.
- The SDK does not publish a pit-stop total.
- The grid is `QualifyResultsInfo` in the weekend YAML.

## Header

- The session type is the normal text color.
- The lap count or the time remaining is the number color.
- A lap-limited session shows the overall leader's lap over the limit, such as `23/48`.
- A timed session shows the time remaining as `m:ss`, and as `h:mm:ss` from one hour.
- An unlimited session shows the type alone.
- The type, the lap or time limit, and the columns follow the current session.
- A page opened in practice switches to the race columns when the sim advances.

## Idle and preview

- While the server reports `idle`, the panel is fully hidden and keeps the last rows.
- `/standings#preview` paints a generated multiclass race through this layout and ignores the live frame.
- `/standings#detail` is that race on the stops, tyre, and place-change frame.
- `/standings#team` is that race on the team-name frame.
- The live page has no hash.
- A screenshot uses a query as well as the hash, because a hash change on an open page does not reload it.
