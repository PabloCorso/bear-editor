/**
 * Physics constants - ported from physics_init.cpp
 */

export const GRAVITY = 10.0;
export const GROUND_ESCAPE_VELOCITY = 0.01;
export const WHEEL_DEFORMATION_LENGTH = 0.005;
export const TWO_POINT_DISCRIMINATION_DISTANCE = 0.1;

export const VOLT_DELAY = 0.4;

export const SPRING_TENSION_COEFFICIENT = 10000.0;
export const SPRING_RESISTANCE_COEFFICIENT = 1000.0;

export const HEAD_RADIUS = 0.238;
export const OBJECT_RADIUS = 0.4;

// Physics timestep
export const PHYSICS_DT = 0.0055;

const GAME_TIME_SCALE_MS = 0.182 * 0.0024;
export const TIME_TO_CENTISECONDS = 100.0 / (GAME_TIME_SCALE_MS * 1000.0);

export const TIME_TO_FRAME_INDEX = 30 / (GAME_TIME_SCALE_MS * 1000.0);
export const FRAME_INDEX_TO_TIME = 1.0 / TIME_TO_FRAME_INDEX;

// Bike initial positions (relative to bike center at 2.75, 3.6)
export const BIKE_INIT_X = 2.75;
export const BIKE_INIT_Y = 3.6;
export const LEFT_WHEEL_INIT_X = 1.9;
export const LEFT_WHEEL_INIT_Y = 3.0;
export const RIGHT_WHEEL_INIT_X = 3.6;
export const RIGHT_WHEEL_INIT_Y = 3.0;
export const BODY_INIT_X = 2.75;
export const BODY_INIT_Y = 4.04;

// Relative wheel positions (computed from initial positions)
export const LEFT_WHEEL_DX = LEFT_WHEEL_INIT_X - BIKE_INIT_X; // -0.85
export const LEFT_WHEEL_DY = LEFT_WHEEL_INIT_Y - BIKE_INIT_Y; // -0.6
export const RIGHT_WHEEL_DX = RIGHT_WHEEL_INIT_X - BIKE_INIT_X; // 0.85
export const RIGHT_WHEEL_DY = RIGHT_WHEEL_INIT_Y - BIKE_INIT_Y; // -0.6
export const BODY_DY = BODY_INIT_Y - BIKE_INIT_Y; // 0.44

// Bike physics parameters
export const BIKE_MASS = 200;
export const BIKE_RADIUS = 0.3;
export const BIKE_INERTIA = 200.0 * 0.55 * 0.55; // 60.5

export const WHEEL_MASS = 10;
export const WHEEL_RADIUS = 0.4;
export const WHEEL_INERTIA = 0.32;

// Stepper constants
export const GAS_TORQUE = 600.0;
export const BRAKE_FORCE = 1000.0;
export const BRAKE_FRICTION = 100.0;
export const MAX_SPIN_OMEGA = 110.0;
export const VOLT_ANGULAR_IMPULSE = 12.0;
export const VOLT_RESIDUAL_CHANGE = 3.0;

// Bump sound threshold
export const BUMP_THRESHOLD = 1.5;

export const LEVEL_MAX_SIZE = 188;
export const SEGMENTS_BORDER = 6;

// Conversion used by both forward simulation and real-time rewind.
export const GAME_TIME_PER_SECOND = 1000 * 0.182 * 0.0024;
