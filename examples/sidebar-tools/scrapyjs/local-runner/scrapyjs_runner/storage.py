"""Bounded SQLite source of truth with a recoverable on-disk JSONL mirror."""
import json
from contextlib import contextmanager
import os
from pathlib import Path
import sqlite3
from .dsl import canonical, nonempty
from .errors import Fault

TERMINAL = frozenset({'COMPLETED','FAILED','STOPPED','INTERRUPTED'})
MAX_RUN_BYTES = 8*1024*1024
MAX_TOTAL_BYTES = 64*1024*1024


class Store:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.path = self.directory/'runs.sqlite3'

    @contextmanager
    def connect(self):
        conn = sqlite3.connect(self.path,timeout=5)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys=ON')
        try:
            with conn: yield conn
        finally: conn.close()

    def initialize(self, boot):
        with self.connect() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY,owner TEXT NOT NULL,scope TEXT NOT NULL,request TEXT NOT NULL,signature TEXT NOT NULL,snapshot TEXT NOT NULL,outcome TEXT,bytes INTEGER NOT NULL DEFAULT 0, UNIQUE(owner,request))')
            db.execute('CREATE TABLE IF NOT EXISTS records (run TEXT NOT NULL,idx INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(run,idx),FOREIGN KEY(run) REFERENCES runs(id))')
            db.execute('INSERT OR REPLACE INTO meta VALUES (?,?)',('boot',boot))

    def assert_boot(self,db,boot):
        row = db.execute('SELECT value FROM meta WHERE key=?',('boot',)).fetchone()
        if not row or row[0]!=boot: raise Fault('OWNER_EXITED')

    def get(self,run_id):
        with self.connect() as db:
            row=db.execute('SELECT * FROM runs WHERE id=?',(run_id,)).fetchone()
            return dict(row) if row else None

    def by_request(self,owner,request):
        with self.connect() as db:
            row=db.execute('SELECT * FROM runs WHERE owner=? AND request=?',(owner,request)).fetchone()
            return dict(row) if row else None

    def create(self,owner,scope,request,signature,snapshot):
        with self.connect() as db:
            if db.execute('SELECT COUNT(*) FROM runs').fetchone()[0]>=100:
                raise Fault('RETENTION_LIMIT','100 retained runs reached; offline owner maintenance is required',409)
            if db.execute('SELECT COALESCE(SUM(bytes),0) FROM runs').fetchone()[0]>=MAX_TOTAL_BYTES:
                raise Fault('STORAGE_LIMIT',status=409)
            db.execute('INSERT INTO runs(id,owner,scope,request,signature,snapshot) VALUES (?,?,?,?,?,?)',
                       (snapshot['runId'],owner,scope,request,signature,canonical(snapshot)))
        self.mirror(snapshot['runId'])

    def update(self,run_id,changes):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT snapshot FROM runs WHERE id=?',(run_id,)).fetchone()
            snapshot=json.loads(row[0]); snapshot.update(changes)
            db.execute('UPDATE runs SET snapshot=? WHERE id=?',(canonical(snapshot),run_id))
            return snapshot

    def commit_page(self,run_id,records,boot):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            self.assert_boot(db,boot)
            row=db.execute('SELECT snapshot,bytes FROM runs WHERE id=?',(run_id,)).fetchone()
            snap=json.loads(row['snapshot']); index=snap['recordsCount']
            encoded=[canonical(record) for record in records]
            if any(len(value.encode())>16384 for value in encoded): raise Fault('RECORD_TOO_LARGE')
            size=sum(len(value.encode())+1 for value in encoded)
            total=db.execute('SELECT COALESCE(SUM(bytes),0) FROM runs').fetchone()[0]
            if row['bytes']+size>MAX_RUN_BYTES or total+size>MAX_TOTAL_BYTES: raise Fault('STORAGE_LIMIT')
            if index+len(records)>2000: raise Fault('RECORD_LIMIT')
            db.executemany('INSERT INTO records VALUES (?,?,?)',[(run_id,index+i,value) for i,value in enumerate(encoded)])
            snap['pagesVisited']+=1; snap['recordsCount']+=len(records)
            for field,counts in snap['completeness'].items():
                counts['total']+=len(records)
                counts['nonEmpty']+=sum(nonempty(rec.get(field)) for rec in records)
                counts['ratio']=round(counts['nonEmpty']/counts['total'],6) if counts['total'] else 0.0
            db.execute('UPDATE runs SET snapshot=?,bytes=bytes+? WHERE id=?',(canonical(snap),size,run_id))
        # Flush each committed page. SQLite is authoritative after a hard crash.
        with (self.directory/(run_id+'.jsonl')).open('ab') as file:
            for value in encoded: file.write(value.encode()+b'\n')
            file.flush(); os.fsync(file.fileno())
        return snap

    def outcome(self,run_id,outcome,boot):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE'); self.assert_boot(db,boot)
            db.execute('UPDATE runs SET outcome=? WHERE id=?',(canonical(outcome),run_id))

    def values(self,run_id,offset=0,limit=2000):
        # Own connection closes even if a streaming consumer disconnects early.
        with self.connect() as db:
            for row in db.execute('SELECT value FROM records WHERE run=? AND idx>=? AND idx<? ORDER BY idx',(run_id,offset,offset+limit)):
                yield row[0]

    def mirror(self,run_id):
        path=self.directory/(run_id+'.jsonl')
        temporary=path.with_suffix('.jsonl.tmp')
        with temporary.open('wb') as file:
            for value in self.values(run_id): file.write(value.encode()+b'\n')
            file.flush(); os.fsync(file.fileno())
        temporary.replace(path)

    def recover(self):
        with self.connect() as db:
            rows=db.execute('SELECT id,snapshot FROM runs').fetchall()
        for row in rows:
            snap=json.loads(row['snapshot'])
            if snap['status'] not in TERMINAL or not snap['workerExited']:
                self.update(row['id'],{'status':'INTERRUPTED','stopReason':'SERVICE_RESTART','workerExited':True,'previewPassed':False})
            self.mirror(row['id'])
