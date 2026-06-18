import mysql from 'mysql2/promise';

async function main() {
  console.log('Connecting to MySQL...');
  const connection = await mysql.createConnection({
    host: '67.217.247.155',
    user: 'chk',
    password: 'checo2100',
    database: 'mostrador12025'
  });

  try {
    console.log('Querying first 5 rows from clientes:');
    const [rows] = await connection.query('SELECT * FROM clientes LIMIT 5');
    console.log(JSON.stringify(rows, null, 2));

    console.log('Checking if there are other tables that might relate to clients or addresses:');
    const [tables] = await connection.query('SHOW TABLES');
    console.log('Tables:', tables.map(t => Object.values(t)[0]));

  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
