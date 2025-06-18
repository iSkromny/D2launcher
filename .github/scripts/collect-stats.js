const { Octokit } = require("@octokit/rest");
const fs = require("fs");

module.exports = async () => {
  try {
    const octokit = new Octokit({ 
      auth: process.env.GITHUB_TOKEN,
      userAgent: "D2Launcher Stats Collector"
    });
    
    const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
    
    // Получаем все релизы
    const releases = await octokit.paginate(
      octokit.repos.listReleases,
      { owner, repo, per_page: 100 }
    );
    
    // Формируем статистику
    const stats = {
      updated_at: new Date().toISOString(),
      total_releases: releases.length,
      total_downloads: 0,
      releases: []
    };
    
    for (const release of releases) {
      const releaseStats = {
        id: release.id,
        tag_name: release.tag_name,
        created_at: release.created_at,
        downloads: 0,
        assets: []
      };
      
      // Считаем скачивания для каждого ассета
      for (const asset of release.assets) {
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
    fs.writeFileSync("stats.json", JSON.stringify(stats, null, 2));
    console.log("Statistics collected successfully!");
    
  } catch (error) {
    console.error("Error collecting stats:", error);
    process.exit(1);
  }
};
