import { describe, expect, it } from 'vitest';
import {
  recoverScionMandarinLessonSequence,
  resolveScionTargetLanguageKnowledge,
  resolveScionTargetLanguagePair,
} from '../scionLanguageKnowledge.js';

describe('Scion compiler-owned Mandarin knowledge', () => {
  it('returns the same canonical pair with three complete cited source facts', () => {
    const input = {
      courseName: 'Elementary Mandarin Chinese I',
      lesson: { title: 'Lesson 10: Shopping and Money', topics: 'Shopping Vocabulary; Asking Prices' },
    };
    const knowledge = resolveScionTargetLanguageKnowledge(input);
    expect(knowledge.pair).toEqual(resolveScionTargetLanguagePair(input));
    expect(knowledge.facts).toHaveLength(3);
    expect(knowledge.projectionLabel).toBe('Shopping and Money');
    expect(knowledge.facts.every((fact) => fact.length >= 20 && /[.!?]$/.test(fact))).toBe(true);
    expect(knowledge.source).toMatchObject({ license: 'CC BY-NC-SA', url: expect.stringMatching(/^https:\/\//) });
  });

  it.each([
    ['Pinyin and Four Tones', '妈'],
    ['Greetings and Introductions', '你好'],
    ['Classroom Language', '请再说一遍。'],
    ['Classroom Expressions', '请再说一遍。'],
    ['Numbers, Age, and Dates', '我今年二十岁。'],
    ['Family and Possession', '这是我的妈妈。'],
    ['Daily Routines and Telling Time', '我每天七点起床。'],
    ['Core Sentence Patterns and Negation', '我不喜欢苹果。'],
    ['Vocabulary Recall and Grammar Review', '我喜欢苹果。'],
    ['Basic Characters and Short Reading', '我是学生。'],
    ['Food and Dining', '我喜欢吃米饭。'],
    ['Shopping and Money', '这个多少钱？'],
    ['Weather and Clothing', '今天天气很冷。'],
    ['Transportation and Directions', '我坐地铁去学校。'],
    ['Health and Feelings', '我今天不舒服。'],
    ['Course Review and Final Oral Performance', '你好，我叫李明。'],
    ['Hobbies and Leisure', '我喜欢听音乐。'],
    ['School and Campus', '图书馆在食堂旁边。'],
  ])('admits every canonical lesson ledger: %s', (title, hanzi) => {
    const knowledge = resolveScionTargetLanguageKnowledge({
      courseName: 'Elementary Mandarin Chinese I',
      lesson: { title: `Lesson: ${title}` },
    });
    expect(knowledge?.pair?.hanzi).toBe(hanzi);
    expect(knowledge?.facts).toHaveLength(3);
    expect(knowledge.facts.every((fact) => fact.length >= 20 && /[.!?]$/.test(fact))).toBe(true);
  });

  it('keeps direct lesson identity ahead of earlier review anchors', () => {
    const knowledge = resolveScionTargetLanguageKnowledge({
      courseName: 'Elementary Mandarin Chinese I',
      lesson: {
        title: 'Lesson 8: Basic Characters and Short Reading',
        topics: 'Introduction to Hanzi; Stroke Order Practice; Writing Basic Characters; Short Reading Passages',
        reviewAnchors: ['Greetings and Introductions', 'Family and Possession'],
      },
    });
    expect(knowledge?.pair?.hanzi).toBe('我是学生。');
  });

  it('does not inject Mandarin claims into an unrelated course', () => {
    expect(
      resolveScionTargetLanguageKnowledge({
        courseName: 'Retail Operations',
        lesson: { title: 'Shopping and Money', topics: 'Asking Prices' },
      }),
    ).toBeNull();
  });

  it('admits only the exact fifteen-lesson beginner sequence gap', () => {
    const explicitTopics = [
      'pinyin system and the four tones',
      'greetings and self-introductions',
      'classroom language',
      'numbers, age, and dates',
      'family members and possession with 的',
      'daily routines and telling time',
      'core SVO sentence patterns with 不, 没, and 吗',
      'basic characters and short reading passages',
      'food and dining',
      'shopping and money',
      'weather and clothing',
      'transportation and directions',
      'health and feelings',
      'course review leading to a final oral performance',
    ];
    const recovered = recoverScionMandarinLessonSequence({
      courseName: 'Elementary Mandarin Chinese I',
      expectedLessons: 15,
      explicitTopics,
    });
    expect(recovered).toHaveLength(15);
    expect(recovered[7]).toBe('Vocabulary Recall and Grammar Review');
    expect(
      recoverScionMandarinLessonSequence({
        courseName: 'Advanced Mandarin',
        expectedLessons: 15,
        explicitTopics,
      }),
    ).toEqual([]);
  });
});
