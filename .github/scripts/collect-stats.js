const fs = require('fs');
const path = require('path');

async function main() {
  try {
    console.log("Starting stats collection...");
    console.log("Current directory:", process.cwd());
    
    // Динамический импорт Octokit
    const { Octokit } = await import('@octokit/rest');
    console.log("Octokit imported successfully");
    
    const token = process.env.GITHUB_TOKEN;
    const repository = process.env.GITHUB_REPOSITORY;
    
    if (!token || !repository) {
      throw new Error("Missing required environment variables");
    }
    
    const [owner, repo] = repository.split("/");
    console.log(`Repository: ${owner}/${repo}`);
    
    const octokit = new Octokit({ 
      auth: token,
      userAgent: "D2Launcher Stats Collector"
    });
    
    // Получаем все релизы
    console.log("Fetching releases...");
    const releases = await octokit.paginate("GET /repos/{owner}/{repo}/releases", {
      owner,
      repo,
      per_page: 100
    });
    
    console.log(`Found ${releases.length} releases`);
    
    // Формируем статистику
    const stats = {
      updated_at: new Date().toISOString(),
      total_releases: releases.length,
      total_downloads: 0,
      releases: []
    };
    
    for (const release of releases) {
      console.log(`Processing release: ${release.tag_name}`);
      const releaseStats = {
        id: release.id,
        tag_name: release.tag_name,
        created_at: release.created_at,
        downloads: 0,
        assets: []
      };
      
      // Считаем скачивания для каждого ассета
      for (const asset of release.assets || []) {
        console.log(`- Asset: ${asset.name} (${asset.download_count} downloads)`);
        releaseStats.downloads += asset.download_count;
        stats.total_downloads += asset.download_count;
        
        releaseStats.assets.push({
          name: asset.name,
          downloads: asset.download_count,
          content_type: asset.content_type
        });
      }
      
      stats.releases.push(releaseStats);
    }
    
    // Сохраняем в файл
    const filePath = path.join(process.cwd(), "stats.json");
    fs.writeFileSync(filePath, JSON.stringify(stats, null, 2));
    console.log(`Statistics saved to ${filePath}`);
    console.log(`Total downloads: ${stats.total_downloads}`);
    
    return true;
  } catch (error) {
    console.error("Error collecting stats:", error);
    // Создаем пустой файл в случае ошибки
    const filePath = path.join(process.cwd(), "stats.json");
    fs.writeFileSync(filePath, JSON.stringify({
      error: error.message,
      updated_at: new Date().toISOString()
    }, null, 2));
    console.log("Created empty stats.json with error details");
    return false;
  }
}

// Запуск основной функции
main().then(success => {
  process.exit(success ? 0 : 1);
});
