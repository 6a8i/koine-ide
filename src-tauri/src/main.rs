// Evita abrir uma janela de console extra no Windows em modo release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    koine_ide_lib::run()
}
