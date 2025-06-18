#!/bin/bash

set -e

# Установка инструментов
sudo apt-get update
sudo apt-get install -y jq

# Аутентификация
echo "Authenticating with GitHub..."
gh auth login --with-token <<< "$GITHUB_TOKEN"

# Получение информации о репозитории
owner=$(echo "$GITHUB_REPOSITORY" | cut -d'/' -f1)
repo=$(echo "$GITHUB_REPOSITORY" | cut -d'/' -f2)
echo "Collecting stats for $owner/$repo"

# Получение списка релизов
echo "Fetching releases..."
releases_json=$(gh api "repos/$owner/$repo/releases")
total_releases=$(echo "$releases_json" | jq length)

# Загрузка исторических данных
if [ -f "historical_data.json" ]; then
    historical_data=$(cat historical_data.json)
else
    historical_data="{}"
fi

# Текущая дата
current_date=$(date -u +"%Y-%m-%d")

# Инициализация основного объекта статистики
stats=$(jq -n \
    --arg updated_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    --argjson total_releases "$total_releases" \
    '{
        updated_at: $updated_at,
        total_releases: $total_releases,
        total_downloads: 0,
        releases: [],
        daily_downloads: {}
    }')

# Обработка релизов
for i in $(seq 0 $((total_releases - 1))); do
    release=$(echo "$releases_json" | jq ".[$i]")
    tag_name=$(echo "$release" | jq -r '.tag_name')
    release_id=$(echo "$release" | jq -r '.id')
    
    echo "Processing release: $tag_name"
    
    # Получение ассетов релиза
    assets_json=$(gh api "repos/$owner/$repo/releases/$release_id/assets" 2>/dev/null || echo '[]')
    assets_count=$(echo "$assets_json" | jq length)
    
    # Инициализация статистики релиза
    release_stats=$(jq -n \
        --arg tag_name "$tag_name" \
        --arg created_at "$(echo "$release" | jq -r '.created_at')" \
        --argjson release_id "$release_id" \
        '{
            id: $release_id,
            tag_name: $tag_name,
            created_at: $created_at,
            downloads: 0,
            assets: []
        }')
    
    # Обработка ассетов
    for j in $(seq 0 $((assets_count - 1))); do
        asset=$(echo "$assets_json" | jq ".[$j]")
        name=$(echo "$asset" | jq -r '.name')
        downloads=$(echo "$asset" | jq -r '.download_count')
        
        # Обновление статистики релиза
        release_stats=$(echo "$release_stats" | jq \
            --arg name "$name" \
            --argjson downloads "$downloads" \
            '.downloads += $downloads |
             .assets += [{
                 name: $name,
                 downloads: $downloads
             }]')
    done
    
    # Обновление общей статистики
    release_downloads=$(echo "$release_stats" | jq '.downloads')
    stats=$(echo "$stats" | jq \
        --argjson release_stats "$release_stats" \
        --argjson downloads "$release_downloads" \
        '.total_downloads += $downloads |
         .releases += [$release_stats]')
    
    # Обновление ежедневной статистики
    for j in $(seq 0 $((assets_count - 1))); do
        asset=$(echo "$assets_json" | jq ".[$j]")
        asset_id=$(echo "$asset" | jq -r '.id')
        asset_name=$(echo "$asset" | jq -r '.name')
        current_downloads=$(echo "$asset" | jq -r '.download_count')
        
        # Получение исторических данных для этого ассета
        historical_downloads=$(echo "$historical_data" | jq --arg id "$asset_id" '.[$id] // 0')
        
        # Рассчитать скачивания за сегодня
        daily_downloads=$((current_downloads - historical_downloads))
        
        # Обновить статистику для текущего дня
        stats=$(echo "$stats" | jq \
            --arg date "$current_date" \
            --arg name "$asset_name" \
            --argjson downloads "$daily_downloads" \
            '.daily_downloads[$date] = (.daily_downloads[$date] // {}) |
             .daily_downloads[$date][$name] = (.daily_downloads[$date][$name] // 0) + $downloads')
    done
done

# Обновить исторические данные для будущих сравнений
updated_historical_data=$(echo "$releases_json" | jq '
    reduce .[] as $release ({}; 
        reduce $release.assets[] as $asset (.;
            .[$asset.id | tostring] = $asset.download_count
        )
    )
')

# Сохранение результатов
echo "$stats" | jq '.' > stats.json
echo "$updated_historical_data" | jq '.' > historical_data.json
echo "Statistics saved to stats.json"
echo "Historical data updated"
