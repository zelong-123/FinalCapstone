<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('app:backup-database')
    ->dailyAt('02:00')
    ->withoutOverlapping()
    ->onOneServer();
