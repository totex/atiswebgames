<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        <title>{{ __('Welcome') }} - {{ config('app.name', 'Laravel') }}</title>

        <link rel="icon" href="/favicon.ico" sizes="any">
        <link rel="icon" href="/favicon.svg" type="image/svg+xml">
        <link rel="apple-touch-icon" href="/apple-touch-icon.png">

        @fonts

        @vite(['resources/css/app.css'])
    </head>
    <body class="bg-[#171c19] text-[#f1f5f2] flex p-6 lg:p-8 items-center lg:justify-center min-h-screen flex-col">
        <header class="w-full lg:max-w-4xl max-w-[335px] text-sm mb-6 not-has-[nav]:hidden">
            @if (Route::has('login'))
                <nav class="flex items-center justify-end gap-4">
                    @auth
                        <a
                            href="{{ route('dashboard') }}"
                            class="inline-block px-5 py-1.5 border border-[#ffffff30] text-[#f1f5f2] hover:border-[#ffffff80] rounded-sm text-sm leading-normal"
                        >
                            Dashboard
                        </a>
                    @else
                        <a
                            href="{{ route('login') }}"
                            class="inline-block px-5 py-1.5 text-[#f1f5f2] border border-transparent hover:border-[#ffffff80] rounded-sm text-sm leading-normal"
                        >
                            Log in
                        </a>

                        @if (Route::has('register'))
                            <a
                                href="{{ route('register') }}"
                                class="inline-block px-5 py-1.5 border border-[#ffffff30] text-[#f1f5f2] hover:border-[#ffffff80] rounded-sm text-sm leading-normal">
                                Register
                            </a>
                        @endif
                    @endauth
                </nav>
            @endif
        </header>
        <div class="w-full px-4">
            <main class="mx-auto grid w-full max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
                <a
                    href="{{ route('sudoku') }}"
                    class="group flex min-h-56 flex-col rounded-lg border border-[#3b4840] bg-[#242d27] p-6 text-[#f1f5f2] shadow-md transition duration-200 hover:-translate-y-1 hover:border-[#74d99e] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#74d99e] focus-visible:ring-offset-2 focus-visible:ring-offset-[#171c19]"
                >
                    <span class="mb-8 text-xs font-semibold uppercase tracking-[0.12em] text-[#aab7af]">Logic puzzle</span>
                    <h1 class="mb-2 text-xl font-semibold">Sudoku Solver</h1>
                    <p class="text-sm leading-6 text-[#aab7af]">Train your brain with a Sudoku game.</p>
                    <span class="mt-auto flex items-center justify-between pt-8 text-sm font-medium">
                        <span>Play Sudoku</span>
                        <span aria-hidden="true" class="text-[#74d99e] transition-transform group-hover:translate-x-1">&rarr;</span>
                    </span>
                </a>
                <a
                    href="{{ route('tetris') }}"
                    class="group flex min-h-56 flex-col rounded-lg border border-[#3b4840] bg-[#242d27] p-6 text-[#f1f5f2] shadow-md transition duration-200 hover:-translate-y-1 hover:border-[#74d99e] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#74d99e] focus-visible:ring-offset-2 focus-visible:ring-offset-[#171c19]"
                >
                    <span class="mb-8 text-xs font-semibold uppercase tracking-[0.12em] text-[#aab7af]">Logic puzzle</span>
                    <h1 class="mb-2 text-xl font-semibold">Tetris</h1>
                    <p class="text-sm leading-6 text-[#aab7af]">Train your brain with a Tetris game.</p>
                    <span class="mt-auto flex items-center justify-between pt-8 text-sm font-medium">
                        <span>Play Tetris</span>
                        <span aria-hidden="true" class="text-[#74d99e] transition-transform group-hover:translate-x-1">&rarr;</span>
                    </span>
                </a>
                <a
                    href="{{ route('minesweeper') }}"
                    class="group flex min-h-56 flex-col rounded-lg border border-[#3b4840] bg-[#242d27] p-6 text-[#f1f5f2] shadow-md transition duration-200 hover:-translate-y-1 hover:border-[#74d99e] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#74d99e] focus-visible:ring-offset-2 focus-visible:ring-offset-[#171c19]"
                >
                    <span class="mb-8 text-xs font-semibold uppercase tracking-[0.12em] text-[#aab7af]">Logic puzzle</span>
                    <h1 class="mb-2 text-xl font-semibold">Minesweeper</h1>
                    <p class="text-sm leading-6 text-[#aab7af]">Train your brain with a Minesweeper game.</p>
                    <span class="mt-auto flex items-center justify-between pt-8 text-sm font-medium">
                        <span>Play Minesweeper</span>
                        <span aria-hidden="true" class="text-[#74d99e] transition-transform group-hover:translate-x-1">&rarr;</span>
                    </span>
                </a>
            </main>
        </div>

        @if (Route::has('login'))
            <div class="h-14.5 hidden lg:block"></div>
        @endif
    </body>
</html>
