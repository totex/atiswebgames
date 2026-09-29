<?php

namespace App\Models;

use App\Enums\GameDifficulty;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Attributes\Fillable;


#[Fillable(['game_id', 'user_id', 'score', 'duration', 'metadata', 'level', 'difficulty'])]
class GameScore extends Model
{
    protected function casts(): array
    {
        return [
            'difficulty' => GameDifficulty::class,
        ];
    }
}
