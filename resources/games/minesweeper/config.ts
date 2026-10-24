
enum ReleaseState {
    DEBUG = "DEBUG",
    RELEASE = "RELEASE"
}

export const conf = {
    canvas_pixel_width: 1200,
    canvas_pixel_height: 900,
    grid_pixel_width: 900,
    grid_pixel_height: 900,
    cell_pixel_width: 30,
    cell_pixel_height: 30,
    circle_radius: 15,
    num_hor_cells: 30,
    num_ver_cells: 30,
    game_title: "Minesweeper",
    state: ReleaseState.DEBUG
}

export default conf;