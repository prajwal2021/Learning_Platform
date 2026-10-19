"""Builds api/seed/guides.json and api/seed/guide-assets/ from the Drive documents in source-docs/.

    tools/.venv/bin/python tools/build_guides.py
"""
import html
import json
import re
import shutil
from pathlib import Path

from docx_to_html import W, Doc, esc

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source-docs"
SEED = ROOT / "api/seed"
ASSETS = SEED / "guide-assets"


def core_build():
    d = Doc(SRC / "core-build-starter-guide.docx")
    body = d.root.find(W + "body")
    kids = [c for c in body if c.tag in (W + "p", W + "tbl")]
    text = lambda p: "".join(t.text or "" for t in p.iter(W + "t"))
    eyebrow, title, subtitle = text(kids[0]), text(kids[1]), text(kids[2])
    # drop the printed contents list (its page numbers mean nothing on a web page; the viewer builds one from the headings)
    start = next(i for i, k in enumerate(kids) if k.tag == W + "p" and text(k).strip() == "Contents")
    first_h = next(i for i, k in enumerate(kids) if k.tag == W + "p" and d.style(k) == "Heading1")
    body_kids = kids[3:start] + kids[first_h:]
    out = d.blocks(body_kids)
    out = out.replace("__ASSET__/", "/api/guides/core-build-starter-guide/assets/")
    dest = ASSETS / "core-build-starter-guide"
    shutil.rmtree(dest, ignore_errors=True)
    dest.mkdir(parents=True)
    for name, data in d.images.items():
        (dest / name).write_bytes(data)
    return {
        "slug": "core-build-starter-guide", "ord": 0, "eyebrow": eyebrow.title(), "title": title, "subtitle": subtitle,
        "source": "Core Build Starter Guide.docx", "html": out,
    }


def row(cells, head=False, cls=None):
    tag = "th" if head else "td"
    return "<tr>" + "".join(
        f'<{tag}{(" class=%s" % chr(34) + c[1] + chr(34)) if isinstance(c, tuple) and c[1] else ""}>{c[0] if isinstance(c, tuple) else c}</{tag}>'
        for c in cells) + "</tr>"


def box(name, *lines):
    return f"<b>{name}</b>" + "".join(f"<br>{l}" for l in lines)


def src_list(items):
    return "<ul>" + "".join(f'<li>{label}: <a href="https://{url}" target="_blank" rel="noopener noreferrer">{url}</a></li>' for label, url in items) + "</ul>"


def job_queue():
    p1 = '<div class="tablewrap"><table class="stacks">' + "\n".join([
        row(["", "arq on Redis", "RabbitMQ", "SQS"], head=True),
        row([("Producer", "c-label"), box("Your app", "Enqueues with arq"), box("Your app", "Publishes a message"), box("Your app", "Calls SendMessage")]),
        row(["", "↓ job", "↓ job", "↓ job"]),
        row([("Holder", "c-label"), box("Redis", "Stores jobs and markers only"),
             (box("RabbitMQ", "Tracks and redelivers", "Requeues unacked jobs"), "c-note"),
             (box("SQS", "Tracks and redelivers", "Visibility timeout", "Hosted by AWS"), "c-note")]),
        row(["", "↓ job ↑ marker", "↓ job ↑ ack", "↓ job ↑ delete"]),
        row([("Task library", "c-label"), (box("arq", "Tracks and redelivers", "In-progress marker with expiry"), "c-note"),
             box("Optional", "Celery, Dramatiq,", "or a plain client"), box("Optional", "Celery, or the AWS SDK alone")]),
        row(["", "↓ job ↑ result", "↓ job ↑ ack", "↓ job ↑ delete"]),
        row([("Worker", "c-label"), box("Task code", "Runs inside the arq worker"), box("Task code", "Sends ack when done"), box("Task code", "Deletes message when done")]),
    ]) + "</table></div>"
    legend = '<p class="legend"><span class="sw c-note"></span> Layer that tracks work and redelivers <span class="sw plain"></span> Optional layer</p>'
    p2 = '<div class="tablewrap"><table class="stacks">' + "\n".join([
        row([("Producer", "c-label"), (box("Your app", "Writes the order and an outbox row"), "")], ),
        row(["↓ both rows, in one transaction", ""]),
        row([("Database", "c-label"), box("PostgreSQL", "The app's own database, not Redis")]),
        row(["", "<table class='inner'><tr><td>" + box("Orders table", "The order") + "</td><td class='c-note'>" + box("Outbox table", "Outbox piece", "One row for each job to send") + "</td></tr></table>"]),
        row(["↓ outbox rows ↑ poll, then mark sent", ""]),
        row([("Relay", "c-label"), ("<b>Relay process</b><br>Outbox piece<br>Separate small process. Polls the outbox table and forwards each job.", "c-note")]),
        row(["↓ job, to any holder", ""]),
        row([("Holder", "c-label"), "<table class='inner'><tr><td>" + box("Redis", "Relay enqueues with arq") + "</td><td>" + box("RabbitMQ", "Relay publishes a message") + "</td><td>" + box("SQS", "Relay calls SendMessage") + "</td></tr><tr><td>↓ arq on Redis stack</td><td>↓ RabbitMQ stack</td><td>↓ SQS stack</td></tr></table>"]),
    ]) + "</table></div>"
    legend2 = '<p class="legend"><span class="sw c-note"></span> Piece added by the outbox pattern</p>'
    h = f"""
<h2 id="panel-1">Panel 1: arq on Redis, RabbitMQ, and SQS, compared layer by layer</h2>
{p1}
{legend}
<h3>How to read it</h3>
<p>Each column is one stack. A job moves down from the producer to the worker, and the word beside each up arrow is what the lower layer sends back. The shaded box is the layer that tracks jobs in progress and redelivers a job when a worker dies. In the arq column that logic is in the arq library, and Redis only stores the state. In the RabbitMQ and SQS columns the holder does it, and the worker reports back with an ack (RabbitMQ) or a delete call (SQS). All three can deliver a job more than once, so task code should be safe to run twice.</p>
<h3>When to pick each</h3>
<p><b>arq on Redis:</b> Pick it when you have a Python asyncio app that already runs Redis, job volume is modest, and you do not want to add another service. After a hard worker crash, a job runs again only after its in-progress marker expires (the longest job timeout plus 10 seconds, 310 seconds by default). arq is in maintenance only mode: the maintainers fix critical security issues and say not to expect other new work.</p>
<p><b>RabbitMQ:</b> Pick it when you need routing (exchanges, topics, fan-out), priorities, or workers in several languages, and you can operate a broker. RabbitMQ requeues unacked jobs when the worker's channel or connection closes.</p>
<p><b>SQS:</b> Pick it when you are on AWS and do not want to run a broker. SQS redelivers only when the visibility timeout expires (default 30 seconds, maximum 12 hours), so set the timeout longer than your longest job.</p>
<h3>Sources, checked October 11, 2026</h3>
{src_list([("arq maintenance status", "github.com/python-arq/arq/issues/510"), ("arq documentation and source, version 0.28.0", "arq-docs.helpmanual.io"), ("RabbitMQ consumer acknowledgements", "rabbitmq.com/docs/confirms"), ("SQS visibility timeout", "docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html")])}
<h2 id="outbox">Where the outbox fits</h2>
<h2 id="panel-2">Panel 2: the outbox pattern, drawn once because it is the same for all three stacks</h2>
{p2}
{legend2}
<h3>How to read it</h3>
<p>Without the outbox, the app writes the order to PostgreSQL and the job to the holder as two separate writes, and a failure between them can leave an order with no job. With the outbox, the app does not write the job to the holder. It writes the order and an outbox row to its own PostgreSQL database in one transaction, so both are saved or neither is. The relay is a separate small process, like a worker but on the sending side. It polls the outbox table, forwards each job to the holder, and marks the row as sent.</p>
<h3>How it fits the three stacks</h3>
<p><b>Holder:</b> The relay forwards each job to the one holder the stack uses. It enqueues with arq, publishes to RabbitMQ, or calls SendMessage on SQS, which is the step the producer does in panel 1. From the holder down, each stack is the same as in panel 1.</p>
<p><b>Scope:</b> The outbox covers the step where a job is created. The three stacks differ in who tracks delivery after the job is in the holder. These are separate steps, so the outbox is the same for all three.</p>
<p><b>Database:</b> The outbox table is in the app's own PostgreSQL database, the same database as the orders table. It is not in Redis, and an outbox row is not a job in the queue until the relay forwards it.</p>
<p><b>Duplicates:</b> The relay can forward a job more than once, for example if it stops after forwarding a job and before marking the row as sent. Task code should be safe to run twice, as in panel 1.</p>
<h3>Sources, checked October 11, 2026</h3>
{src_list([("Transactional outbox pattern", "microservices.io/patterns/data/transactional-outbox")])}
"""
    return {"slug": "job-queue-stack-comparison", "ord": 1, "eyebrow": "Reference", "title": "Three ways to run a job queue",
            "subtitle": "arq on Redis, RabbitMQ and SQS compared layer by layer, and where the outbox pattern fits.",
            "source": "Job queue stack comparison with outbox.docx", "html": h}


def roadmap():
    lines = (SRC / "planned-labs-and-levels.txt").read_text().splitlines()
    out, stack, sid = [], [], 0

    def close(depth):
        while len(stack) > depth:
            out.append("</li></ul>")
            stack.pop()

    for raw in lines:
        if not raw.strip():
            continue
        m = re.match(r"^( *)\* (.*)$", raw)
        if m:
            depth = len(m.group(1)) // 3 + 1
            text = esc(m.group(2))
            if depth <= len(stack):
                close(depth)
                out.append("</li>")
            else:
                out.append("<ul>")
                stack.append(1)
            out.append("<li>" + text)
            continue
        close(0)
        if re.match(r"^Level \d", raw):
            out.append(f"<h3>{esc(raw)}</h3>")
        elif raw.strip() == "Out":
            out.append('<h2 id="out">Out</h2>')
        else:
            sid += 1
            out.append(f'<h2 id="track{sid}">{esc(raw)}</h2>')
    close(0)
    # a list that is still open at a heading closes with </ul>; fix the </li></ul> pairs produced by close()
    h = "\n".join(out)
    return {"slug": "planned-labs-and-levels", "ord": 2, "eyebrow": "Roadmap", "title": "Planned labs and levels",
            "subtitle": "Every lab and topic planned for the path, by track and level, and what is left out.",
            "source": "Planned Labs and Levels (Google Doc)", "html": h}


guides = [core_build(), job_queue(), roadmap()]
SEED.mkdir(exist_ok=True)
(SEED / "guides.json").write_text(json.dumps({"guides": guides}, ensure_ascii=False))
for g in guides:
    print(g["slug"], len(g["html"]), "chars")
print("images:", sorted(p.name for p in (ASSETS / "core-build-starter-guide").iterdir()))
