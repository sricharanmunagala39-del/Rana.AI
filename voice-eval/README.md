# Telugu call test set

The answer key RANA AI uses to pick its in-house speech-to-text model, built from real (consented) call recordings.

1. `langid.py`: confirms each recording's language.
2. `draft.py`: cuts calls into clips of up to 15 s (VAD) and writes first-draft Telugu transcripts with `vasista22/whisper-telugu-small` (Apache-2.0).
   Run it with `MAX_S=150 python3 draft.py rec02 rec03 …`.
3. `review-page.html`: the published review page (claude.ai artifact "Telugu Call Test Set"). Reviewers play each clip and confirm or correct the draft. About one clip in five is listen-only (no draft shown), so the answer key isn't biased toward the draft model.
4. `score.py`: grades any model's output against the corrected key.
   - WER and CER, the latter fairer for Telugu.
   - Number recall: prices, counts and dates.
   - Every metric is shown again on the listen-only clips alone.
   - Run with `python3 score.py answers.json hyp_modelA.jsonl hyp_modelB.jsonl`, and the tests with `python3 -m pytest -q test_score.py`.

No audio, clips or transcripts are committed (see `.gitignore`).
