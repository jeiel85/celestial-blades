# 콘텐츠 라이선스 — CC BY 4.0

천명비행록 : Celestial Blades의 **콘텐츠**는 [크리에이티브 커먼즈 저작자표시 4.0 국제 라이선스(CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/deed.ko)를 따릅니다. 원저작자를 표시하면 복제·배포·수정·상업적 이용을 할 수 있습니다. 법적 전문은 [legalcode](https://creativecommons.org/licenses/by/4.0/legalcode.ko)에 있습니다.

**코드**는 이 라이선스가 아니라 [MIT](LICENSE)를 따릅니다.

Copyright (c) 2026 박용은 (jeiel85)

## 콘텐츠의 범위

- **그림**
  - `src/assets/` 아래의 모든 이미지: 캐릭터·적·보스·탄·이펙트·아이템·배경·스토리·엔딩·컷인 일러스트, 타이틀 로고, 메뉴·터치 UI 그림.
  - `public/icons/`의 앱 아이콘.
  - `share/`의 홍보 이미지와 문구.
- **이야기와 설정 문장**: 스토리 컷신 대본과 대사, 천명사(플레이어 캐릭터)·보스·적·스테이지의 이름과 소개·설정 문장.
  - 이 문장들은 `src/game/data/`의 `story.ts`·`bossTalk.ts`·`characters.ts`·`stages.ts` 같은 소스 파일 안에 들어 있습니다.
  - 그 파일 안에서도 문장·이름은 콘텐츠(CC BY 4.0)이고, 코드 구조·수치·탄막 패턴 같은 로직은 코드(MIT)입니다.

음악과 효과음은 `src/game/systems/AudioSystem.ts`가 게임 실행 중에 만들어 내므로 코드로 보고 MIT를 따릅니다.

## 원저작자 표시 방법

콘텐츠를 쓸 때는 작품을 보는 사람이 알아볼 수 있는 곳(크레딧, 설명란, 게시글 등)에 다음을 적어 주세요.

1. 작품 이름과 원저작자
2. 출처 링크
3. 라이선스
4. 고쳤다면 고쳤다는 사실

예시:

```
천명비행록 : Celestial Blades — 박용은 (jeiel85)
https://github.com/jeiel85/celestial-blades
CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/) · 색과 크기를 바꿈
```

원저작자가 여러분이나 여러분의 작품을 지지·보증하는 것처럼 보이게 쓰면 안 됩니다.

CC BY 4.0은 상표권을 허락하지 않습니다. 출처 표시 말고는 '천명비행록'·'Celestial Blades' 이름이나 로고를 원작·공식 작품으로 오해하게 하는 방식(자기 작품의 제목이나 대표 이미지 등)으로 쓰지 마세요.

## 이 라이선스에 포함되지 않는 것

다음은 이 저장소의 저작물이 아니라 각자의 라이선스를 따릅니다.

| 대상 | 라이선스 |
|---|---|
| 글꼴 Song Myung, Gowun Dodum(`@fontsource` 패키지로 번들) | SIL Open Font License 1.1 |
| Phaser 등 npm 의존성 | 각 패키지의 라이선스 |

---

## English summary

The **content** of Celestial Blades is licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). The **code** is licensed under the [MIT License](LICENSE).

Content means:

- all images under `src/assets/`, the app icons in `public/icons/`, and the promotional material in `share/`;
- the story script and dialogue, and the names and descriptions of the characters, bosses, enemies and stages. These texts live inside source files in `src/game/data/`; the code, numbers and patterns in those files are MIT.

Music and sound effects are synthesized at runtime by code and are therefore MIT.

When you reuse content:

- credit "Celestial Blades — 박용은 (jeiel85)";
- link to https://github.com/jeiel85/celestial-blades and to the license;
- say whether you changed it.

Fonts (SIL OFL 1.1) and npm dependencies keep their own licenses. Trademark rights in the names and logo are not licensed.
