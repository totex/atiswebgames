<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Attributes\Fillable;


#[Fillable(['game_id', 'user_id', 'session_token', 'started_at', 'finished_at', 'status', 'score', 'metadata'])]
class GameSession extends Model
{
    //
}
