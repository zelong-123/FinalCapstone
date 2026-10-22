<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;

class BackupDatabase extends Command
{
    protected $signature = 'app:backup-database {--keep= : Retention in days}';

    protected $description = 'Create a compressed MySQL database backup and prune expired backups.';

    public function handle(): int
    {
        if (config('database.default') !== 'mysql') {
            $this->warn('Database backup currently supports MySQL only.');

            return self::SUCCESS;
        }

        $connection = config('database.connections.mysql');
        $filename = 'backups/franchise-titan-'.now()->format('Ymd-His').'.sql.gz';
        $temporary = storage_path('app/'.str_replace('.gz', '', $filename));
        @mkdir(dirname($temporary), 0775, true);

        $command = [
            config('franchise.mysqldump_binary', 'mysqldump'),
            '--single-transaction', '--quick', '--skip-lock-tables',
            '-h', (string) $connection['host'],
            '-P', (string) $connection['port'],
            '-u', (string) $connection['username'],
            (string) $connection['database'],
        ];

        $process = new Process($command, null, ['MYSQL_PWD' => (string) $connection['password']]);
        $process->setTimeout(600);
        $process->run(function ($type, $buffer) use ($temporary): void {
            if ($type === Process::OUT) {
                file_put_contents($temporary, $buffer, FILE_APPEND);
            }
        });

        if (! $process->isSuccessful()) {
            @unlink($temporary);
            $this->error($process->getErrorOutput() ?: 'mysqldump failed.');

            return self::FAILURE;
        }

        $contents = file_get_contents($temporary);
        Storage::disk(config('franchise.backup_disk', 'local'))->put($filename, gzencode($contents ?: '', 9));
        @unlink($temporary);

        $retentionDays = (int) ($this->option('keep') ?: config('franchise.backup_retention_days', 14));
        foreach (Storage::disk(config('franchise.backup_disk', 'local'))->files('backups') as $file) {
            if (Storage::disk(config('franchise.backup_disk', 'local'))->lastModified($file) < now()->subDays($retentionDays)->timestamp) {
                Storage::disk(config('franchise.backup_disk', 'local'))->delete($file);
            }
        }

        $this->info("Backup created: {$filename}");

        return self::SUCCESS;
    }
}
