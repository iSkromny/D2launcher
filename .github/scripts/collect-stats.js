#!/bin/bash

# Установка GitHub CLI, если не установлен (обычно уже предустановлен в Actions)
if ! command -v gh &> /dev/null; then
    echo "GitHub CLI not found, installing..."
    sudo apt-get update
    sudo apt-get install -y gh
fi

# Аутентификация с GitHub Token
gh auth login --with-token <<< "$GITHUB_TOKEN"

# Получение информации о репозитории
owner=$(echo $GITHUB_REPOSITORY | cut -d'/' -f1)
repo=$(echo $GITHUB_REPOSITORY | cut -d'/' -f2)

echo "Collecting stats for $owner/$repo"

# Получение списка релизов
releases=$(gh api repos/$owner/$repo/releases)

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
for row in $(echo "$releases" | jq -r '.[] | @base64'); do
    release=$(echo "$row" | base64 --decode | jq '.')
    tag_name=$(echo "$release" | jq -r '.tag_name')
    release_id=$(echo "$release" | jq -r '.id')
    
    echo "Processing release: $tag_name"
    
    # Получение ассетов для релиза
    assets=$(gh api repos/$owner/$repo/releases/$release_id/assets)
    
    release_stats=$(jq -n \
        --arg tag_name "$tag_name" \
        --arg created_at "$(echo "$release" | jq -r '.created_at')" \
        --argjson assets "$assets" \
        '{
            id: '$release_id',
            tag_name: $tag_name,
            created_at: $created_at,
            downloads: 0,
            assets: []
        }')
    
    # Обработка ассетов
    for asset_row in $(echo "$assets" | jq -r '.[] | @base64'); do
        asset=$(echo "$asset_row" | base64 --decode | jq '.')
        name=$(echo "$asset" | jq -r '.name')
        downloads=$(echo "$asset" | jq -r '.download_count')
        
        release_stats=$(echo "$release_stats" | jq \
            --arg name "$name" \
            --arg downloads "$downloads" \
            --arg content_type "$(echo "$asset" | jq -r '.content_type')" \
            '.downloads += ($downloads | tonumber) | 
             .assets += [{
                 name: $name,
                 downloads: ($downloads | tonumber),
                 content_type: $content_type
             }]')
    done
    
    # Обновление общей статистики
    total_downloads=$(echo "$release_stats" | jq '.downloads')
    stats=$(echo "$stats" | jq \
        --argjson release_stats "$release_stats" \
        '.total_downloads += $total_downloads |
         .releases += [$release_stats]')
done

# Сохранение результатов
echo "$stats" > stats.json
echo "Statistics saved to stats.json"
