# Telemetry

Numeral overlay for the OBS browser source at `/telemetry`. The source width and height are the panel. A 440×176 source matches the layout this page was drawn at, and other sizes keep the same arrangement.

- Ghost gear, centered: a forward gear is its digit, neutral is `N`, reverse is `R`.
- Speed, top right. Metric sessions (`DisplayUnits` 1) show `km/h`. Imperial sessions show `mph`. The figure is the rounded absolute speed.
- Steering, top left, mirroring speed. A wheel icon, then `L` or `R`, then the absolute angle. The letter sits on the outer side of the angle the way `km/h` sits on the outer side of the speed, and it uses the same size, color, weight, and tracking. When the rounded angle is 0°, that place is a non-breaking space so the angle stays put relative to the wheel. The spokes form a Y, and the orange mark stays at the top of the rim. Positive `SteeringWheelAngle` is treated as a left turn, and the wheel graphic rotates with that letter.
- Five seconds of clutch, brake, and throttle across the lower half of the gear. The newest sample is at the right edge. A stall longer than 100 ms breaks the line instead of drawing a ramp.
- Three vertical bars flush with the right edge of the trace, touching, unlabeled. Order is clutch, brake, throttle. Clutch uses `--accent`, brake uses `--bad`, throttle uses `--good`. An empty bar is the `--rule` track. All three show pedal travel, full when the pedal is pressed.

While the server reports `idle`, the panel takes the shared `is-idle` opacity and keeps the last frame.
