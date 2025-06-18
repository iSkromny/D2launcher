const fs = require('fs');

module.exports = async () => {
  try {
    console.log("Starting stats collection...");
    
    // Динамический импорт Octokit
    const { Octokit } = await import('@octokit/rest');
    console.log("Octokit imported successfully");
    
    const octokit = new Octokit({ 
      auth: process.env.GITHUB_TOKEN,
      userAgent: "D2Launcher Stats Collector"
    });
    
    console.log("GitHub Token:", process.env.GITHUB_TOKEN ? "***" : "MISSING");
    console.log("GITHUB_REPOSITORY:", process.env.GITHUB_REPOSITORY);
    
    if (!process.env.GITHUB_REPOSITORY) {
      throw new Error("GITHUB_REPOSITORY environment variable is missing");
    }
    
    const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
    console.log(`Owner: ${owner}, Repo: ${repo}`);
    
    // Получаем все релизы
    console.log("Fetching releases...");
    const releases = await octokit.paginate(
      octokit.rest.repos.listReleases,
      { 
        owner, 
        repo, 
        per_page: 100 
      }
    );
    
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
      for (const asset of release.assets) {
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
    const filePath = "stats.json";
    fs.writeFileSync(filePath, JSON.stringify(stats, null, 2));
    console.log(`Statistics saved to ${filePath}`);
    console.log(`Total downloads: ${stats.total_downloads}`);
    
  } catch (error) {
    console.error("Error collecting stats:", error);
    process.exit(1);
  }
};
