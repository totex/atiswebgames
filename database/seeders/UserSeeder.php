<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;

class UserSeeder extends Seeder
{
    protected static ?string $password;

    public function run(): void
    {
        $users = [
            'name' => 'Attila',
            'email' => 'ati@mail.com',
            'password' => static::$password ??= Hash::make('jelszo4321'),
            'remember_token' => Str::random(10),
            'email_verified_at' => now(),
        ];

        if (config('app.env') === 'local'){
            if (DB::table('users')->count() == 0) {
                DB::table('users')->insert($users);
            }
        }
    }
}
