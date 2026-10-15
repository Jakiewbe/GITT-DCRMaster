// Release builds are GUI applications; keep the console only for development.
#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

fn main() {
    gitt_dcr_scientific_workbench_lib::run();
}
