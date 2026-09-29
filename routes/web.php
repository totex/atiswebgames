<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\GameController;

// Route::view('/', 'welcome')->name('home');
// Route::view('/sudoku', 'games.single.sudoku')->name('sudoku');
// Route::view('/tetris', 'games.single.tetris')->name('tetris');
// Route::view('/minesweeper', 'games.single.minesweeper')->name('minesweeper');

Route::get('/', [GameController::class, 'index'])
    ->name('games.index');

Route::get('/games/{game:slug}', [GameController::class, 'show'])
    ->name('games.show');



Route::middleware(['auth', 'verified'])->group(function () {
    Route::view('dashboard', 'dashboard')->name('dashboard');
});

require __DIR__.'/settings.php';
