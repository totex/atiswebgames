<?php

use Illuminate\Support\Facades\Route;

Route::view('/', 'welcome')->name('home');
Route::view('/sudoku', 'games.single.sudoku')->name('sudoku');
Route::view('/tetris', 'games.single.tetris')->name('tetris');
Route::view('/minesweeper', 'games.single.minesweeper')->name('minesweeper');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::view('dashboard', 'dashboard')->name('dashboard');
});

require __DIR__.'/settings.php';
