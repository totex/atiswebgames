<?php

namespace Database\Seeders;

// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class GameSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $games = [
            [
                'title' => 'Sudoku',
                'slug' => 'sudoku',
                'description' => 'Train your brain with a Sudoku game',
                'category' => 'logical',
                'status' => 'published',
                'sort_order' => 1
            ],
            [
                'title' => 'Minesweeper',
                'slug' => 'minesweeper',
                'description' => 'Train your brain with a Minesweeper game',
                'category' => 'logical',
                'status' => 'published',
                'sort_order' => 2
            ]
        ];

        if (DB::table('games')->count() == 0) {
            DB::table('games')->insert($games);
        }


    }
}
