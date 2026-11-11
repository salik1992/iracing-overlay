# Telemetry

Numeral overlay for the OBS browser source at `/telemetry`.

- The source width and height are the panel.
- A 440×103 source matches the layout this page was drawn at.
- Other sizes keep the same arrangement.
- While the server reports `idle`, the panel is fully hidden and keeps the last frame.

## Gear

- Centered on the same line as speed and steering, in `--number`.
- Slightly larger than those figures.
- Sits above the traces.
- A forward gear is its digit.
- Neutral is `N`.
- Reverse is `R`.

## RPM lights

Centered in the gap above the gear. Fifteen rectangles, each three times as wide as it is tall.

- Five green (`--good`).
- Five red (`--bad`).
- Five blue (`--accent`).
- An unlit light is `--rule`.
- The first ten walk from `DriverCarSLFirstRPM` to `DriverCarSLShiftRPM`.
- The blue five walk from the shift point to `DriverCarSLLastRPM`.
- At `DriverCarSLBlinkRPM` the whole bar flashes.

## Speed

- Top right.
- Metric sessions (`DisplayUnits` 1) show `km/h`.
- Imperial sessions show `mph`.
- The figure is the rounded absolute speed.
- The unit uses `--number`.

## Steering

Top left, mirroring speed.

- A wheel icon, then `L` or `R`, then the absolute angle.
- The letter sits on the outer side of the angle the way `km/h` sits on the outer side of the speed.
- It uses the same size, color, weight, and tracking.
- When the rounded angle is 0°, that place is a non-breaking space so the angle stays put relative to the wheel.
- The spokes form a Y.
- The orange mark stays at the top of the rim.
- Positive `SteeringWheelAngle` is treated as a left turn.
- The wheel graphic rotates with that letter.

## Pedals

Five seconds of clutch, brake, and throttle on the left, bottom, and right edges of the panel.

- On the 440×103 source the trace and the three bars are 55px tall.
- The newest sample is at the right edge.
- A stall longer than 100 ms breaks the line instead of drawing a ramp.
- Three vertical bars sit flush with the right edge of the trace, touching, unlabeled.
- Order is clutch, brake, throttle.
- Clutch uses `--accent`.
- Brake uses `--bad`.
- Throttle uses `--good`.
- An empty bar is the `--rule` track.
- All three show pedal travel, full when the pedal is pressed.
