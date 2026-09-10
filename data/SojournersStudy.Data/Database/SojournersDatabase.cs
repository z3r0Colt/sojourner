using Microsoft.Data.Sqlite;

namespace SojournersStudy.Data.Database;

/// <summary>Opens connections to the app's SQLite database, creating the schema on first use.</summary>
public sealed class SojournersDatabase
{
    public string DataSource { get; }

    public SojournersDatabase(string dataSource)
    {
        DataSource = dataSource;
    }

    /// <summary>The default per-user database location under %LocalAppData%.</summary>
    public static SojournersDatabase CreateDefault()
    {
        string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SojournersStudy");
        Directory.CreateDirectory(dir);
        return new SojournersDatabase(Path.Combine(dir, "sojourners.db"));
    }

    /// <summary>Opens a connection with the schema applied. Callers own disposal.</summary>
    public SqliteConnection OpenConnection()
    {
        var connection = new SqliteConnection($"Data Source={DataSource}");
        connection.Open();
        using (var command = connection.CreateCommand())
        {
            command.CommandText = Schema.Sql;
            command.ExecuteNonQuery();
        }

        return connection;
    }
}
