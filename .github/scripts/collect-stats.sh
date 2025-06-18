#!/bin/bash

set -e

# Установка необходимых инструментов
sudo apt-get update
sudo apt-get install -y jq

# Аутентификация
echo "Authenticating with GitHub..."
gh auth status || gh auth login --with-token <<< "$GITHUB_TOKEN"

# Получение информации о репозитории
owner=$(echo "$GITHUB_REPOSITORY" | cut -d'/' -f1)
repo=$(echo "$GITHUB_REPOSITORY" | cut -d'/' -f2)

echo "Collecting stats for $owner/$repo"

# Получение списка релизов
echo "Fetching releases..."
releases=$(gh api "repos/$owner/$repo/releases" | jq -c '.')

# Создание JSON-статистики
stats=$(jq -n \
    --arg updated_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    --argjson releases "$releases" \
    '{
        updated_at: $updated_at,
        total_releases: ($releases | length),
        total_downloads: 0,
        releases: []
    }')

# Обработка каждого релиза
for i in $(seq 0 $(($(echo "$releases" | jq 'length') - 1))); do
    release_json=$(echo "$releases" | jq -c ".[$i]")
    tag_name=$(echo "$release_json" | jq -r '.tag_name')
    release_id=$(echo "$release_json" | jq -r '.id')
    
    echo "Processing release: $tag_name"
    
    # Получение ассетов для релиза (с обработкой ошибок)
    assets=$(gh api "repos/$owner/$repo/releases/$release_id/assets" 2>/dev/null || echo '[]' | jq -c '.')
    
    release_stats=$(jq -n \
        --arg tag_name "$tag_name" \
        --arg created_at "$(echo "$release_json" | jq -r '.created_at')" \
        --argjson release_id "$release_id" \
        --argjson assets "$assets" \
        '{
            id: $release_id,
            tag_name: $tag_name,
            created_at: $created_at,
            downloads: 0,
            assets: []
        }')
    
    # Обработка ассетов
    for j in $(seq 0 $(($(echo "$assets" | jq 'length') - 1))); do
        asset_json=$(echo "$assets" | jq -c ".[$j]")
        name=$(echo "$asset_json" | jq -r '.name')
        downloads=$(echo "$asset_json" | jq -r '.download_count')
        
        release_stats=$(echo "$release_stats" | jq \
            --arg name "$name" \
            --argjson downloads "$downloads" \
            --arg content_type "$(echo "$asset_json" | jq -r '.content_type')" \
            '.downloads += $downloads | 
             .assets += [{
                 name: $name,
                 downloads: $downloads,
                 content_type: $content_type
             }]')
    done
    
    # Обновление общей статистики
    total_downloads=$(echo "$release_stats" | jq '.downloads')
    stats=$(echo "$stats" | jq \
        --argjson release_stats "$release_stats" \
        --argjson downloads "$total_downloads" \
        '.total_downloads += $downloads |
         .releases += [$release_stats]')
done

# Сбор ежедневной статистики (исправленная версия)
echo "Сбор ежедневной статистики..."
daily_downloads=$(echo "$releases_json" | jq -c '
    [.[] | {
        date: (.created_at | split("T")[0]),
        downloads: (
            if .assets and (.assets | length) > 0 
            then [.assets[].download_count] | add 
            else 0 
            end
        )
    }]
    | group_by(.date)
    | map({
        date: .[0].date,
        downloads: map(.downloads) | add
    })
    | sort_by(.date)
    | reverse
')

# Отладочный вывод
echo "Daily downloads raw data:"
echo "$daily_downloads"

# Если возникла ошибка, используем пустой массив
if [ $? -ne 0 ] || [ -z "$daily_downloads" ]; then
    echo "Ошибка при сборе ежедневной статистики, используется пустой массив"
    daily_downloads='[]'
fi

# Добавление daily_downloads в итоговую статистику
stats=$(echo "$stats" | jq \
    --argjson daily_downloads "$daily_downloads" \
    '. + {daily_downloads: $daily_downloads}')
# Сохранение результатов
echo "$stats" | jq '.' > stats.json
echo "Statistics saved to stats.json"
