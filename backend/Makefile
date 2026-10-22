.PHONY: setup serve test lint fresh backup

setup:
	./scripts/setup.sh

serve:
	php artisan serve --host=127.0.0.1 --port=8080

test:
	php artisan test

lint:
	./vendor/bin/pint --test

fresh:
	php artisan migrate:fresh --seed

backup:
	php artisan app:backup-database
