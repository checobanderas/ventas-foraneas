const mysql = require('mysql2/promise');

async function main() {
  console.log('Searching for "FLORIBERTO" across all tables in all databases...');
  const connection = await mysql.createConnection({
    host: '67.217.247.155',
    user: 'chk',
    password: 'checo2100',
  });

  try {
    const [dbRows] = await connection.query('SHOW DATABASES');
    const databases = dbRows.map(row => row.Database).filter(db => 
      !['information_schema', 'mysql', 'performance_schema', 'sys', 'phpmyadmin', 'horde', 'roundcubemail'].includes(db)
    );

    for (const dbName of databases) {
      try {
        await connection.query(`USE \`${dbName}\``);
        const [tableRows] = await connection.query('SHOW TABLES');
        
        for (const tRow of tableRows) {
          const tableName = Object.values(tRow)[0];
          
          try {
            // Check if table has columns that we can search
            const [cols] = await connection.query(`DESCRIBE \`${tableName}\``);
            const textCols = cols.filter(c => 
              c.Type.includes('varchar') || c.Type.includes('text') || c.Type.includes('char')
            ).map(c => c.Field);

            if (textCols.length > 0) {
              // Build dynamic search query
              const matchConditions = textCols.map(col => `\`${col}\` LIKE '%FLORIBERTO%'`).join(' OR ');
              const [matches] = await connection.query(`
                SELECT * FROM \`${tableName}\` 
                WHERE ${matchConditions}
              `);

              if (matches.length > 0) {
                console.log(`\n[Found Match] Database: ${dbName} | Table: ${tableName}`);
                console.log(JSON.stringify(matches, null, 2));
              }
            }
          } catch (tErr) {
            // Ignore individual table errors
          }
        }
      } catch (dbErr) {
        // Ignore database errors
      }
    }
  } catch (err) {
    console.error('Search error:', err);
  } finally {
    await connection.end();
    console.log('Search complete.');
  }
}

main();
