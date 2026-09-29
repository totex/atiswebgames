<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Enums\GameReleaseState;
use Illuminate\Database\Eloquent\Attributes\Fillable;

#[Fillable(['title', 'slug', 'description', 'thumbnail', 'category', 'status', 'version', 'sort_order'])]
class Game extends Model
{
    protected function casts(): array
    {
        return [
            'status' => GameReleaseState::class,
        ];
    }
}
