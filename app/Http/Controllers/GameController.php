<?php

namespace App\Http\Controllers;

// use Illuminate\Http\Request;
use App\Models\Game;


class GameController extends Controller
{
    public function index()
    {
        $games = Game::query()
            ->where('status', 'published')
            ->orderBy('sort_order')
            ->get();

        // return view('games.index', compact('games'));
        return view('welcome', compact('games'));
    }

    public function show(Game $game)
    {
        // abort_unless($game->is_published, 404);

        return view('games.show', compact('game'));
    }
}
