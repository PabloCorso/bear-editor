# Play mode rewind and captured starts

Hold R or the rewind button to retrace the current ride at normal speed.
Release to continue with the current controls. Rewind works during a live ride
and after death or finishing with the default pause behavior. Zoom remains live.
The complete approach is retained, including the initial state; history is not a
short rolling window. Automatic restart starts a fresh attempt and automatic exit
leaves play mode, so neither retains the previous attempt for recovery.

Press S or Capture test start to create and activate a session-only test start.
It retains the selected ride state and the history before it. Restarting or
entering play mode from it restores that state, including speed, angle, timer,
gravity, and collected apples. A captured dead start stays frozen until rewound.
Each attempt branches independently and cannot change the captured start.
Both keys can be changed in Play settings and are listed in Keyboard shortcuts.

Captured starts use the existing test-start manager and have a Ride label.
Rename, color, select, and delete them as usual. Use position only removes the
recording. Moving a captured start also converts it to a position start; undo
restores the recording. Moving the level start here uses only its position,
since a level file cannot contain a recorded ride.

## Editing a level between attempts

Recorded rider states are displayed over the current level. No collisions run
while rewinding; forward physics resumes against the current geometry. A newly
placed wall can therefore kill the rider immediately on continuation.

Collected apples match by exact position, like other editor object operations.
An unchanged apple follows its recorded collected state. A moved or added apple
is uncollected; a deleted apple is ignored. Apple counts are recomputed from the
current level. Apples sharing a position also share the recorded collection state.
An apple placed at a previously collected position inherits that position's
collection history. Recorded gravity is retained even if the gravity apple was
changed or removed. No persistent object IDs or level-version lock are required.

## Implementation

`RideHistory` captures complete motor/timing snapshots after advancing game
frames, plus the initial and terminal states. Immutable backward links share
history prefixes between captured starts and working attempts without copying a
whole ride. Collected-position sets are reused when unchanged. The history nodes
compare by identity so editor undo equality does not traverse long ride chains.

Rewind uses the same time conversion as forward simulation. It interpolates only
the displayed pose between snapshots, with discrete object/turn/volt state from
the preceding snapshot. Release or capture selects that actual snapshot, at most
one recorded frame earlier than the interpolated preview. Physics never resumes
from interpolated positions or reconstructed velocities. Restoring clones Vec2
instances, clears frame-local events, reconciles apples with the current level,
and preserves live input and zoom. Object sprite animation uses simulation time.

Terrain, collision grids, camera preferences, listeners, and renderer instances
are not recorded. History is in memory only and is never written to .lev files,
preferences, or replay files. Memory grows with ride duration and display frame
rate; captured starts (and editor undo entries retaining them) keep their shared
prefix alive. Unreferenced abandoned branches can be garbage collected.
