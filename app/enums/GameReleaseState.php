<?php

namespace App\Enums;


enum GameReleaseState: string {
    case DRAFT = 'draft';
    case PUBLISHED = 'published';
    case ARCHIVED = 'archived';
}

