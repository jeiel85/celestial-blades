import type { CharacterId } from './characters';

/**
 * 보스전 직전 대사(텐가이식). 보스 한 마디 → 천명사 대답(캐릭터별) → 보스 한 마디.
 * 중간보스는 대사 없이 바로 싸운다.
 */
export interface BossTalk {
  /** 화자 이름 */
  name: string;
  open: string;
  reply: Record<CharacterId, string>;
  close: string;
}

export const BOSS_TALK: Record<string, BossTalk> = {
  boss_iron: {
    name: '철갑귀 장군 파철',
    open: '천명사 따위가 이 계곡을 넘겠다고? 내 철갑 앞에선 하늘도 무릎 꿇는다!',
    reply: {
      yun: '무릎 꿇는 건 당신의 갑옷 쪽이 될 겁니다.',
      ryeohwa: '철이라면 녹이면 그만이지.',
      mooyoung: '…갑옷엔 늘 틈이 있다.',
      soyul: '그 두꺼운 갑옷, 몇 장까지 꿰뚫나 볼까요?',
      haerang: '그 갑옷에서 깨진 옥새의 기운이 나네요. 내놓으시죠.',
    },
    close: '건방진 것! 쇳덩이 맛을 보여 주마!',
  },
  boss_engine: {
    name: '홍련기관왕 염동로',
    open: '침입자 감지. 연소 효율 최대. 소각 절차를 개시한다.',
    reply: {
      yun: '기계까지 조각에 홀렸나… 멈추게 해 주마.',
      ryeohwa: '불 다루는 법을 가르쳐 줄게. 진짜 불로.',
      mooyoung: '심장은 하나다. 그곳만 노린다.',
      soyul: '코어만 보이면 돼요. 한 발이면 충분해요.',
      haerang: '기계에 깃든 원념… 정화해 드리죠.',
    },
    close: '오차 없음. 전원, 홍련으로 돌아가라.',
  },
  boss_dragon: {
    name: '해룡비 청린',
    open: '또 조각을 노리는 자인가. 이 용궁의 문은 열리지 않는다!',
    reply: {
      yun: '오해입니다! 우린 조각을 지키러—',
      ryeohwa: '말로 안 통하면, 일단 물부터 가르고 얘기해요!',
      mooyoung: '…싸워야 알아듣는 자도 있지.',
      soyul: '먼저 겨눈 건 그쪽이에요. 비켜 주세요.',
      haerang: '당신 결계에서 슬픔이 느껴져요. 무엇을 지키고 계신 거죠?',
    },
    close: '증명해 보아라. 바다의 분노를 견딘다면!',
  },
  boss_maiden: {
    name: '백야천녀 설화',
    open: '스승님의 길을 막으러 왔나요… 그렇다면 여기서 멈춰야 해요.',
    reply: {
      yun: '당신 스승이 하늘을 무너뜨리고 있습니다.',
      ryeohwa: '슬픈 눈을 하고 싸우지 마요. 그건 반칙이야.',
      mooyoung: '망설이는 칼은 아무것도 베지 못한다.',
      soyul: '멈춰야 하는 건 제가 아니라 당신 스승이에요.',
      haerang: '당신도 알고 있죠. 이 길 끝엔 아무도 없다는 걸.',
    },
    close: '…백야의 눈 속에서, 답을 보여 주세요.',
  },
  boss_lantern: {
    name: '등롱귀왕 야명',
    open: '크크크! 산 것의 냄새가 나는구나. 이 야시장에선 목숨도 흥정거리지!',
    reply: {
      yun: '흥정은 없다. 길을 열어라.',
      ryeohwa: '등롱이 이렇게 많은데, 불 붙이기 딱 좋네.',
      mooyoung: '…그림자 장사는 내가 더 잘한다.',
      soyul: '그 등롱 하나하나, 전부 맞혀 드릴게요.',
      haerang: '길 잃은 혼들을 붙잡아 두셨군요. 풀어 주시죠.',
    },
    close: '좋다, 이기면 문을 열어 주마. 지면… 너도 등롱이 되는 거다!',
  },
  final_moo: {
    name: '무명천',
    open: '천 년을 기다렸다. 천명이 사라진 하늘을 보여 주마.',
    reply: {
      yun: '정해진 운명이 싫다면, 스스로 바꾸면 됩니다. 이렇게!',
      ryeohwa: '당신 슬픔은 알겠어. 그래도 하늘을 태우게 둘 순 없어.',
      mooyoung: '이름을 버린 자여. 그림자가 너를 기억한다.',
      soyul: '천 년짜리 표적이네요. 놓치지 않아요.',
      haerang: '당신이 짊어진 것, 이제 같이 들게요.',
    },
    close: '그렇다면 증명하라, 천명의 아이야!',
  },
};
